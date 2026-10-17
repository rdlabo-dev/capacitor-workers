import Foundation
import Capacitor
import AsyncHTTPClient
import NIOCore
import NIOHTTP1

private enum NetworkFailure: Error { case closed, invalid, busy }

// One pending chunk: a write is acknowledged only when the HTTP client pulls it.
private actor Upload {
    private var chunk: ByteBuffer?
    private var writer: CheckedContinuation<Void, Error>?
    private var reader: CheckedContinuation<ByteBuffer?, Error>?
    private var ended = false
    private var closed = false
    func write(_ value: ByteBuffer) async throws {
        guard !closed && !ended else { throw NetworkFailure.closed }
        guard writer == nil else { throw NetworkFailure.busy }
        if let reader { self.reader = nil; reader.resume(returning: value); return }
        try await withCheckedThrowingContinuation { continuation in
            chunk = value; writer = continuation
        }
    }
    func next() async throws -> ByteBuffer? {
        guard !closed else { throw NetworkFailure.closed }
        if let chunk {
            self.chunk = nil
            writer?.resume(); writer = nil
            return chunk
        }
        if ended { return nil }
        return try await withCheckedThrowingContinuation { reader = $0 }
    }
    func end() throws {
        guard !closed else { throw NetworkFailure.closed }
        ended = true
        if chunk == nil { reader?.resume(returning: nil); reader = nil }
    }
    func close() {
        closed = true; chunk = nil
        reader?.resume(throwing: NetworkFailure.closed); reader = nil
        writer?.resume(throwing: NetworkFailure.closed); writer = nil
    }
}
private struct UploadSequence: AsyncSequence, Sendable {
    typealias Element = ByteBuffer
    let upload: Upload
    struct AsyncIterator: AsyncIteratorProtocol {
        let upload: Upload
        mutating func next() async throws -> ByteBuffer? { try await upload.next() }
    }
    func makeAsyncIterator() -> AsyncIterator { AsyncIterator(upload: upload) }
}
private actor ResponseReader {
    private var iterator: HTTPClientResponse.Body.AsyncIterator?
    private var remainder: ByteBuffer?
    private var pending: Task<(ByteBuffer?, HTTPClientResponse.Body.AsyncIterator), Error>?
    private var closed = false
    init(_ body: HTTPClientResponse.Body) { iterator = body.makeAsyncIterator() }
    func read(_ count: Int) async throws -> Data? {
        guard !closed else { throw NetworkFailure.closed }
        guard pending == nil else { throw NetworkFailure.busy }
        while remainder == nil || remainder!.readableBytes == 0 {
            guard var current = iterator else { return nil }
            iterator = nil
            let task = Task { let chunk = try await current.next(); return (chunk, current) }
            pending = task
            do {
                let (chunk, next) = try await task.value
                pending = nil
                guard !closed else { throw NetworkFailure.closed }
                if chunk == nil { return nil }
                iterator = next; remainder = chunk
            } catch { pending = nil; throw error }
        }
        let length = min(count, remainder!.readableBytes)
        return remainder!.readBytes(length: length).map { Data($0) }
    }
    func close() async {
        closed = true
        pending?.cancel()
        _ = try? await pending?.value
        pending = nil; iterator = nil; remainder = nil
    }
}
private actor Connection {
    private let client: HTTPClient
    private let upload = Upload()
    private var opening: Task<HTTPClientResponse, Error>?
    private var reader: ResponseReader?
    private var closed = false
    init(client: HTTPClient) { self.client = client }
    func open(url: String, method: String, headers: [[String]], hasBody: Bool) async throws -> [String: Any] {
        guard !closed else { throw NetworkFailure.closed }
        var request = HTTPClientRequest(url: url)
        request.method = HTTPMethod(rawValue: method)
        for pair in headers { request.headers.add(name: pair[0], value: pair[1]) }
        if hasBody { request.body = .stream(UploadSequence(upload: upload), length: .unknown) }
        let task = Task { try await client.execute(request, deadline: .distantFuture) }
        opening = task
        let response: HTTPClientResponse
        do { response = try await task.value; opening = nil }
        catch { opening = nil; throw error }
        guard !closed else { throw NetworkFailure.closed }
        reader = ResponseReader(response.body)
        let code = Int(response.status.code)
        return ["status": code, "statusText": response.status.reasonPhrase,
                "headers": response.headers.map { [$0.name, $0.value] },
                "hasBody": method != "HEAD" && ![101, 204, 205, 304].contains(code)]
    }
    func write(_ data: Data) async throws {
        guard !closed else { throw NetworkFailure.closed }
        try await upload.write(ByteBuffer(bytes: data))
    }
    func end() async throws { try await upload.end() }
    func read(_ count: Int) async throws -> Data? {
        guard !closed, let reader else { throw NetworkFailure.closed }
        return try await reader.read(count)
    }
    func close() async {
        closed = true
        opening?.cancel()
        await upload.close()
        _ = try? await opening?.value
        opening = nil
        await reader?.close(); reader = nil
    }
}
private final class Connections {
    private var client: HTTPClient?
    private var stopped = false
    private let lock = NSLock()
    private var values: [String: Connection] = [:]
    func create(_ id: String) throws -> Connection {
        lock.lock(); defer { lock.unlock() }
        guard !stopped else { throw NetworkFailure.closed }
        guard values[id] == nil else { throw NetworkFailure.invalid }
        if client == nil { client = HTTPClient(eventLoopGroupProvider: .singleton, configuration: .init(redirectConfiguration: .disallow, decompression: .disabled)) }
        let connection = Connection(client: client!); values[id] = connection; return connection
    }
    func connection(_ id: String) throws -> Connection {
        lock.lock(); defer { lock.unlock() }
        guard let value = values[id] else { throw NetworkFailure.closed }; return value
    }
    private func remove(_ id: String) -> Connection? {
        lock.lock(); defer { lock.unlock() }; return values.removeValue(forKey: id)
    }
    private func removeAll() -> [Connection] {
        lock.lock(); defer { lock.unlock() }
        let closing = Array(values.values); values.removeAll(); return closing
    }
    func close(_ id: String) async { await remove(id)?.close() }
    func closeAll() async { for connection in removeAll() { await connection.close() } }
    private func stop() -> ([Connection], HTTPClient?) {
        lock.lock(); defer { lock.unlock() }
        stopped = true
        let closing = Array(values.values); values.removeAll()
        let client = client; self.client = nil
        return (closing, client)
    }
    func shutdown() async {
        let (closing, client) = stop()
        for connection in closing { await connection.close() }
        try? await client?.shutdown()
    }
}

final class NetworkBridge {
    private let connections = Connections()
    private let sockets = SocketBridge()
    private let callbackLock = NSLock()
    private var valid = true
    func invalidate() { callbackLock.lock(); valid = false; callbackLock.unlock() }
    private func resolve(_ call: CAPPluginCall, _ value: PluginCallResultData = [:]) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        if valid { call.resolve(value) }
    }
    private func reject(_ call: CAPPluginCall, _ message: String) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        if valid { call.reject(message) }
    }
    private func socketResult(_ call: CAPPluginCall) -> SocketBridge.Completion {
        return { result in
            switch result {
            case .success(let value): self.resolve(call, value)
            case .failure(let error): self.reject(call, String(describing: error))
            }
        }
    }
    func socketWatch(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.watch(id: id, completion: socketResult(call))
    }
    func socketOpen(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let host = call.getString("host"), let port = call.getInt("port") else { reject(call, "Invalid socket open"); return }
        sockets.open(id: id, host: host, port: port, tls: call.getBool("tls") ?? false, completion: socketResult(call))
    }
    func socketWrite(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let encoded = call.getString("chunk"), let data = Data(base64Encoded: encoded) else { reject(call, "Invalid socket write"); return }
        sockets.write(id: id, data: data, end: false, completion: socketResult(call))
    }
    func socketEnd(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.write(id: id, data: nil, end: true, completion: socketResult(call))
    }
    func socketRead(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.read(id: id, count: call.getInt("maxBytes") ?? 65536, completion: socketResult(call))
    }
    func socketClose(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing socket"); return }
        sockets.close(id: id, completion: socketResult(call))
    }
    func networkOpen(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty,
              let url = call.getString("url"), let parsed = URL(string: url),
              let scheme = parsed.scheme, ["http", "https"].contains(scheme),
              let method = call.getString("method"), !method.isEmpty,
              let headers = call.getArray("headers") as? [[String]],
              headers.allSatisfy({ $0.count == 2 }) else { reject(call, "Invalid network request"); return }
        let connection: Connection
        do { connection = try connections.create(id) } catch { reject(call, String(describing: error)); return }
        Task { do { resolve(call, try await connection.open(url: url, method: method, headers: headers, hasBody: call.getBool("hasBody") ?? false)) } catch { await connections.close(id); reject(call, String(describing: error)) } }
    }
    func networkWrite(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let encoded = call.getString("chunk"),
              let data = Data(base64Encoded: encoded), data.count <= 65536 else { reject(call, "Invalid upload chunk"); return }
        Task { do { try await connections.connection(id).write(data); resolve(call) } catch { reject(call, String(describing: error)) } }
    }
    func networkEnd(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing connection"); return }
        Task { do { try await connections.connection(id).end(); resolve(call) } catch { reject(call, String(describing: error)) } }
    }
    func networkRead(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing connection"); return }
        let count = call.getInt("maxBytes") ?? 65536
        guard count > 0 && count <= 65536 else { reject(call, "Invalid read size"); return }
        Task { do {
            let data = try await connections.connection(id).read(count)
            resolve(call, data.map { ["chunk": $0.base64EncodedString()] } ?? ["eof": true])
        } catch { reject(call, String(describing: error)) } }
    }
    func networkClose(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { reject(call, "Missing connection"); return }
        Task { await connections.close(id); resolve(call) }
    }
    func closeAll() async { await connections.closeAll(); await sockets.closeAll() }
    func shutdown() async { await connections.shutdown(); await sockets.closeAll(stopping: true) }
}
