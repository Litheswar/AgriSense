const multer = require('multer');
const { authenticate, loadOwnedFarm } = require('./authentication');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const receiveImage = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 1,
    parts: 2,
    fieldNameSize: 32,
    fieldSize: 64,
    headerPairs: 100
  }
}).single('image');

function parseDiseaseImage(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return res.status(400).json({ success: false, error: { code: 'MULTIPART_REQUIRED', message: 'Send multipart/form-data with one image field.' } });
  }

  receiveImage(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: { code: 'IMAGE_TOO_LARGE', message: 'Image exceeds the 5 MB upload limit.' } });
      }
      if (error.code === 'LIMIT_FILE_COUNT' || (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === 'image')) {
        return res.status(400).json({ success: false, error: { code: 'TOO_MANY_FILES', message: 'Upload exactly one image in the image field.' } });
      }
      return res.status(400).json({ success: false, error: { code: 'INVALID_MULTIPART', message: 'Multipart fields are invalid.' } });
    }
    return res.status(400).json({ success: false, error: { code: 'MALFORMED_MULTIPART', message: 'Multipart request is malformed.' } });
  });
}

function authorizeOptionalFarm(req, res, next) {
  const farmId = req.body && req.body.farmId;
  if (farmId === undefined) return next();
  if (typeof farmId !== 'string' || !farmId.trim()) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_FARM_ID', message: 'Invalid farm ID.' } });
  }
  req.params.farmId = farmId.trim();
  return authenticate(req, res, () => loadOwnedFarm(req, res, next));
}

module.exports = { parseDiseaseImage, authorizeOptionalFarm, MAX_IMAGE_BYTES };
