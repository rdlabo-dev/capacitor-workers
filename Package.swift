// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RdlaboCapacitorWorkers",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RdlaboCapacitorWorkers", targets: ["RdlaboCapacitorWorkers"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/swift-server/async-http-client.git", exact: "1.36.2"),
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.100.0")
    ],
    targets: [
        .target(
            name: "RdlaboCapacitorWorkers",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "AsyncHTTPClient", package: "async-http-client"),
                .product(name: "NIOCore", package: "swift-nio"),
                .product(name: "NIOHTTP1", package: "swift-nio")
            ],
            path: "native/ios"
        )
    ]
)
