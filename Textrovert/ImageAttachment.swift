import PhotosUI
import SwiftUI
import UIKit

struct PreparedImageAttachment: Identifiable {
    let id = UUID()
    let image: UIImage
    let jpegData: Data
    let pixelWidth: Int
    let pixelHeight: Int

    var byteCount: Int { jpegData.count }
}

@MainActor
final class ImageAttachmentPickerModel: ObservableObject {
    @Published var selection: PhotosPickerItem? {
        didSet {
            guard selection != nil else { return }
            Task { await loadSelection() }
        }
    }

    @Published private(set) var attachment: PreparedImageAttachment?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    func removeAttachment() {
        selection = nil
        attachment = nil
        errorMessage = nil
    }

    private func loadSelection() async {
        guard let selection else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            guard let sourceData = try await selection.loadTransferable(type: Data.self),
                  let sourceImage = UIImage(data: sourceData) else {
                throw ImageAttachmentError.unreadable
            }

            let resized = sourceImage.resized(maxPixelDimension: 2048)
            guard let jpegData = resized.jpegData(compressionQuality: 0.82) else {
                throw ImageAttachmentError.unreadable
            }
            guard jpegData.count <= 12 * 1024 * 1024 else {
                throw ImageAttachmentError.tooLarge
            }

            attachment = PreparedImageAttachment(
                image: resized,
                jpegData: jpegData,
                pixelWidth: Int(resized.size.width * resized.scale),
                pixelHeight: Int(resized.size.height * resized.scale)
            )
        } catch {
            attachment = nil
            errorMessage = error.localizedDescription
        }
    }
}

enum ImageAttachmentError: LocalizedError {
    case unreadable
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .unreadable:
            "This image couldn’t be opened. Try choosing another photo."
        case .tooLarge:
            "This image is too large to attach. Choose a smaller image."
        }
    }
}

struct ConvexImageUploader {
    let makeUploadURL: @Sendable () async throws -> URL

    func upload(_ attachment: PreparedImageAttachment) async throws -> String {
        let uploadURL = try await makeUploadURL()
        var request = URLRequest(url: uploadURL)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = attachment.jpegData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse,
              (200..<300).contains(response.statusCode) else {
            throw ImageUploadError.rejected
        }

        let result = try JSONDecoder().decode(ConvexUploadResponse.self, from: data)
        return result.storageId
    }
}

private struct ConvexUploadResponse: Decodable {
    let storageId: String
}

enum ImageUploadError: LocalizedError {
    case rejected

    var errorDescription: String? {
        "The image couldn’t be uploaded. Your question and attachment are still available to retry."
    }
}

private extension UIImage {
    func resized(maxPixelDimension: CGFloat) -> UIImage {
        let pixelWidth = size.width * scale
        let pixelHeight = size.height * scale
        let longestSide = max(pixelWidth, pixelHeight)
        guard longestSide > maxPixelDimension else { return self }

        let factor = maxPixelDimension / longestSide
        let targetSize = CGSize(width: pixelWidth * factor, height: pixelHeight * factor)
        let renderer = UIGraphicsImageRenderer(size: targetSize)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}
