const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const allowedImages = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
};

export function validateDiseaseUpload(files) {
  const selectedFiles = Array.from(files || []);
  if (selectedFiles.length === 0) return { valid: false, code: 'MISSING_IMAGE' };
  if (selectedFiles.length > 1) return { valid: false, code: 'TOO_MANY_FILES' };
  const file = selectedFiles[0];
  if (!file || file.size === 0) return { valid: false, code: 'EMPTY_FILE' };
  if (file.size > MAX_IMAGE_BYTES) return { valid: false, code: 'IMAGE_TOO_LARGE' };

  const extension = file.name?.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedImages[extension] || file.type !== allowedImages[extension]) {
    return { valid: false, code: 'UNSUPPORTED_MEDIA_TYPE' };
  }
  return { valid: true, file };
}

export function diseaseDetectionErrorMessage(error) {
  const messages = {
    MISSING_IMAGE: "Choose one image to upload.",
    EMPTY_FILE: 'The selected image is empty. Choose another image.',
    IMAGE_TOO_LARGE: 'Choose an image that is 5 MB or smaller.',
    TOO_MANY_FILES: 'Upload one image at a time.',
    MULTIPART_REQUIRED: 'The image could not be sent in the required upload format. Please try again.',
    INVALID_MULTIPART: 'The upload fields were not accepted. Choose one image and try again.',
    MALFORMED_MULTIPART: 'The image upload was incomplete. Please try again.',
    INVALID_FILENAME: 'The image filename is invalid. Rename the file and try again.',
    UNSUPPORTED_MEDIA_TYPE: 'Upload a JPEG or PNG image with a matching file type.',
    UNSUPPORTED_FILE_CONTENT: 'The file contents are not a supported JPEG or PNG image.',
    INVALID_FARM_ID: 'The selected Farm could not be identified. Select it again and retry.',
    FARM_NOT_FOUND: 'This Farm could not be found or is no longer available to your account.',
    UNAUTHENTICATED: 'Your session may have expired. Sign in again to save this detection to a Farm.',
    AUTH_NOT_CONFIGURED: 'Farm authentication is temporarily unavailable. Try again later.',
    TIMEOUT: 'Disease detection timed out. Please try again.',
    DiseaseInferenceError: 'The selected image could not be analyzed. Choose a valid leaf image and try again.',
    INTERNAL_SERVER_ERROR: 'Image validation is temporarily unavailable. Please try again later.'
  };
  return messages[error?.code] || error?.message || 'Disease detection could not be completed. Please try again.';
}

export function diseaseDetectionErrorTitle(error) {
  if (error?.status === 401 || error?.code === 'UNAUTHENTICATED') return 'Sign in required to save to a Farm';
  if (error?.status === 404 || error?.code === 'FARM_NOT_FOUND') return 'Farm unavailable';
  if (error?.status === 413 || error?.status === 415 || error?.status === 400) return 'Image upload needs attention';
  if (error?.status === 503 || error?.code === 'TIMEOUT') return 'Detection service unavailable';
  return 'Disease detection could not be completed';
}

export function diseaseOutcomeMode(outcome, selectedFarmId) {
  if (!outcome) return 'none';
  if (!outcome.linked) return 'standalone-result';
  return outcome.farmId === selectedFarmId ? 'farm-result' : 'stale-farm-result';
}

export function formatDiseaseConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  const percent = value * 100;
  return `${percent.toFixed(Number.isInteger(percent) ? 0 : 1)}%`;
}
