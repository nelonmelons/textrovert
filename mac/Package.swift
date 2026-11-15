// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "Textrovert",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "TextrovertCore"),
        .executableTarget(name: "Textrovert", dependencies: ["TextrovertCore"]),
        .executableTarget(name: "textrovert-upload", dependencies: ["TextrovertCore"]),
    ]
)
