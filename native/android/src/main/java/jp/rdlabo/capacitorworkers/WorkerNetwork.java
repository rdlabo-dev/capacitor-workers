package jp.rdlabo.capacitorworkers;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.Unpooled;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.FixedRecvByteBufAllocator;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioSocketChannel;
import io.netty.handler.codec.http.*;
import io.netty.handler.ssl.SslHandler;
import java.net.URI;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLParameters;

/**
 * Raw HTTP byte transport. HTTP policy (redirects, cookies and decompression)
 * belongs to JavaScript. Each connection owns its channel; there is no shared
 * cookie jar or cache. Manual reads bound response buffering to one socket read,
 * and writes settle only when Netty has flushed the supplied chunk.
 */
public final class WorkerNetwork {
    private static final int CHUNK_SIZE = 65536;
    public interface Result {
        void resolve(JSObject value);
        void reject(String message);
    }
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();
    private EventLoopGroup group;
    private boolean stopped;

    private final class Connection extends SimpleChannelInboundHandler<HttpObject> {
        final String id;
        final String method;
        final Result opening;
        final ArrayDeque<byte[]> chunks = new ArrayDeque<>();
        ChannelFuture connecting;
        Channel channel;
        Result reading;
        int readSize;
        int offset;
        boolean headers;
        boolean ended;
        final AtomicBoolean writing = new AtomicBoolean();
        boolean complete;
        boolean closed;
        String failure;

        Connection(String id, String method, Result opening) {
            this.id = id; this.method = method; this.opening = opening;
        }
        @Override public void handlerAdded(ChannelHandlerContext context) { channel = context.channel(); }
        // All connection state is confined to its channel event loop.
        void afterConnect(Runnable action, Result result) {
            connecting.addListener(future -> {
                if (!future.isSuccess() || closed) result.reject(failure == null ? "Connection closed" : failure);
                else action.run();
            });
        }
        void fail(String message) {
            if (closed) return;
            closed = true; failure = message;
            chunks.clear();
            if (!headers) { headers = true; opening.reject(message); }
            if (reading != null) { Result result = reading; reading = null; result.reject(message); }
            connections.remove(id, this);
            channel.close();
        }
        void drain() {
            if (reading == null) return;
            JSObject value = new JSObject();
            if (!chunks.isEmpty()) {
                byte[] chunk = chunks.peek();
                int count = Math.min(readSize, chunk.length - offset);
                value.put("chunk", Base64.encodeToString(chunk, offset, count, Base64.NO_WRAP));
                offset += count;
                if (offset == chunk.length) { chunks.remove(); offset = 0; }
            } else if (complete) value.put("eof", true);
            else { channel.read(); return; }
            Result result = reading; reading = null; result.resolve(value);
        }
        @Override protected void channelRead0(ChannelHandlerContext context, HttpObject object) {
            if (closed) return;
            if (!object.decoderResult().isSuccess()) { fail("Invalid HTTP response"); return; }
            if (object instanceof HttpResponse) {
                HttpResponse response = (HttpResponse) object;
                int code = response.status().code();
                if (code < 200 && code != 101) return;
                if (headers) { fail("Unexpected HTTP response"); return; }
                headers = true;
                JSObject value = new JSObject();
                value.put("status", code);
                value.put("statusText", response.status().reasonPhrase());
                JSArray list = new JSArray();
                for (Map.Entry<String, String> header : response.headers()) {
                    JSArray pair = new JSArray(); pair.put(header.getKey()); pair.put(header.getValue()); list.put(pair);
                }
                value.put("headers", list);
                value.put("hasBody", !method.equals("HEAD") && code != 101 && code != 204 && code != 205 && code != 304);
                opening.resolve(value);
            }
            if (object instanceof HttpContent && headers) {
                HttpContent content = (HttpContent) object;
                int count = content.content().readableBytes();
                if (count > 0) {
                    byte[] bytes = new byte[count]; content.content().readBytes(bytes); chunks.add(bytes);
                }
                if (object instanceof LastHttpContent) complete = true;
                drain();
            }
        }
        @Override public void channelReadComplete(ChannelHandlerContext context) {
            if (!closed && (!headers || (reading != null && !complete && chunks.isEmpty()))) context.read();
        }
        @Override public void channelInactive(ChannelHandlerContext context) {
            if (!complete) fail("Connection closed before response completed");
        }
        @Override public void exceptionCaught(ChannelHandlerContext context, Throwable error) {
            fail("Request failed: " + error.getMessage());
        }
    }

    public synchronized void open(String id, String url, String method, List<String[]> headers,
                                   boolean hasBody, String encodeResponseBody, Result result) {
        if (stopped) { result.reject("Network runtime is closed"); return; }
        if (id == null || id.isEmpty() || connections.containsKey(id)) { result.reject("Invalid or duplicate network handle"); return; }
        Connection connection = null;
        try {
            URI uri = new URI(url);
            boolean tls = "https".equals(uri.getScheme());
            if ((!tls && !"http".equals(uri.getScheme())) || uri.getHost() == null) throw new IllegalArgumentException("HTTP(S) URL required");
            if (method == null || !method.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+")) throw new IllegalArgumentException("Invalid HTTP method");
            if (hasBody && (method.equals("GET") || method.equals("HEAD"))) throw new IllegalArgumentException("Method cannot carry a body");
            int port = uri.getPort() >= 0 ? uri.getPort() : tls ? 443 : 80;
            if (port < 1 || port > 65535) throw new IllegalArgumentException("Invalid port");
            String path = uri.getRawPath();
            if (path == null || path.isEmpty()) path = "/";
            if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
            DefaultHttpRequest request = new DefaultHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.valueOf(method), path);
            for (String[] pair : headers) {
                if (pair == null || pair.length != 2) throw new IllegalArgumentException("Invalid HTTP header");
                request.headers().add(pair[0], pair[1]);
            }
            if (!request.headers().contains(HttpHeaderNames.HOST)) request.headers().set(HttpHeaderNames.HOST, uri.getRawAuthority());
            if (hasBody && !request.headers().contains(HttpHeaderNames.CONTENT_LENGTH)) HttpUtil.setTransferEncodingChunked(request, true);
            // No pooling: EOF-delimited responses and cancellation have one owner.
            request.headers().set(HttpHeaderNames.CONNECTION, "close");
            final SSLEngine engine;
            if (tls) {
                engine = SSLContext.getDefault().createSSLEngine(uri.getHost(), port);
                engine.setUseClientMode(true);
                SSLParameters parameters = engine.getSSLParameters();
                parameters.setEndpointIdentificationAlgorithm("HTTPS");
                engine.setSSLParameters(parameters);
            } else engine = null;
            if (group == null) group = new NioEventLoopGroup(1);
            connection = new Connection(id, method, result);
            final Connection owned = connection;
            connections.put(id, connection);
            ChannelFuture connecting = new Bootstrap().group(group).channel(NioSocketChannel.class)
                .option(ChannelOption.AUTO_READ, false)
                .option(ChannelOption.RCVBUF_ALLOCATOR, new FixedRecvByteBufAllocator(CHUNK_SIZE).maxMessagesPerRead(1))
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 30000)
                .handler(new ChannelInitializer<SocketChannel>() {
                    @Override protected void initChannel(SocketChannel channel) {
                        if (engine != null) channel.pipeline().addLast(new SslHandler(engine));
                        channel.pipeline().addLast(new HttpClientCodec(), owned);
                    }
                }).connect(uri.getHost(), port);
            owned.channel = connecting.channel();
            owned.connecting = connecting;
            connecting.addListener(future -> {
                if (!future.isSuccess()) { owned.fail("Connection failed: " + future.cause()); return; }
                if (owned.closed) { owned.channel.close(); return; }
                owned.channel.writeAndFlush(request).addListener(written -> {
                    if (!written.isSuccess()) owned.fail("Header write failed: " + written.cause());
                });
                owned.channel.read();
            });
        } catch (Exception error) {
            if (connection != null) {
                connections.remove(id, connection);
                if (connection.channel != null) connection.channel.close();
            }
            result.reject("Invalid network request: " + error.getMessage());
        }
    }
    public synchronized void write(String id, String chunkBase64, Result result) {
        Connection connection = connections.get(id);
        if (connection == null) { result.reject("Unknown network handle"); return; }
        // Admit before registering a connect listener, so even an unresolved DNS
        // or TLS connection cannot accumulate an unbounded queue of uploads.
        if (!connection.writing.compareAndSet(false, true)) { result.reject("Write already pending"); return; }
        Result accepted = new Result() {
            public void resolve(JSObject value) { connection.writing.set(false); result.resolve(value); }
            public void reject(String message) { connection.writing.set(false); result.reject(message); }
        };
        final byte[] chunk;
        try { chunk = Base64.decode(chunkBase64, Base64.DEFAULT); }
        catch (IllegalArgumentException error) { accepted.reject("Malformed base64 chunk"); return; }
        if (chunk.length > CHUNK_SIZE) { accepted.reject("Upload chunk exceeds limit"); return; }
        connection.afterConnect(() -> {
            if (connection.ended) { accepted.reject("Upload already ended"); return; }
            connection.channel.writeAndFlush(new DefaultHttpContent(Unpooled.wrappedBuffer(chunk))).addListener(future -> {
                if (future.isSuccess()) accepted.resolve(null);
                else { accepted.reject("Write failed: " + future.cause()); connection.fail("Upload failed"); }
            });
        }, accepted);
    }
    public synchronized void end(String id, Result result) {
        Connection connection = connections.get(id);
        if (connection == null) { result.reject("Unknown network handle"); return; }
        connection.afterConnect(() -> {
            if (connection.writing.get()) { result.reject("Write still pending"); return; }
            if (connection.ended) { result.resolve(null); return; }
            connection.ended = true;
            connection.channel.writeAndFlush(LastHttpContent.EMPTY_LAST_CONTENT).addListener(future -> {
                if (future.isSuccess()) result.resolve(null);
                else { result.reject("Upload end failed: " + future.cause()); connection.fail("Upload failed"); }
            });
        }, result);
    }
    public synchronized void read(String id, int maxBytes, Result result) {
        Connection connection = connections.get(id);
        if (connection == null) { result.reject("Unknown network handle"); return; }
        if (maxBytes <= 0 || maxBytes > CHUNK_SIZE) { result.reject("Invalid read size"); return; }
        connection.afterConnect(() -> {
            if (connection.reading != null) { result.reject("Read already pending"); return; }
            connection.reading = result; connection.readSize = maxBytes; connection.drain();
        }, result);
    }
    public synchronized void close(String id, Result result) {
        Connection connection = connections.remove(id);
        if (connection == null) { result.resolve(null); return; }
        connection.channel.eventLoop().execute(() -> {
            connection.fail("Connection closed");
            connection.channel.close().addListener(future -> result.resolve(null));
        });
    }
    public synchronized void shutdown() {
        if (stopped) return;
        stopped = true;
        for (Connection connection : connections.values()) {
            connection.channel.eventLoop().execute(() -> connection.fail("Network runtime is closed"));
        }
        connections.clear();
        if (group != null) group.shutdownGracefully(0, 2, TimeUnit.SECONDS);
    }
}
