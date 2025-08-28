# File Upload System Documentation

## Overview
The upload system supports images and PDFs with configurable field-based validation. Each field has specific file type restrictions and limits.

## Supported Upload Fields

### Current Fields:
- **`icon`** - Images only (PNG, JPG, JPEG, GIF, SVG, WebP)
  - Max files: 1
  - Max size: 5MB
  
- **`project_attachment`** - PDFs only
  - Max files: 10
  - Max size: 10MB each
  
- **`avatar`** - Images only (PNG, JPG, JPEG, GIF, WebP)
  - Max files: 1
  - Max size: 3MB

## API Usage

### Endpoint
```
POST /api/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

### Request Example
```javascript
const formData = new FormData();
formData.append('icon', iconFile);
formData.append('project_attachment', pdfFile1);
formData.append('project_attachment', pdfFile2);
formData.append('avatar', avatarFile);
```

### Response Format
```json
{
  "success": true,
  "message": "Files uploaded successfully",
  "data": {
    "files": {
      "icon": [
        {
          "filename": "icon_logo_1724855260123-987654321.png",
          "originalName": "logo.png",
          "mimetype": "image/png",
          "size": 1024567,
          "path": "/path/to/file",
          "url": "/uploads/files/icon_logo_1724855260123-987654321.png"
        }
      ],
      "project_attachment": [
        {
          "filename": "project_attachment_doc_1724855260124-987654322.pdf",
          "originalName": "document.pdf",
          "mimetype": "application/pdf",
          "size": 2048000,
          "path": "/path/to/file",
          "url": "/uploads/files/project_attachment_doc_1724855260124-987654322.pdf"
        }
      ]
    }
  }
}
```

## Adding New Upload Fields

To add a new upload field, modify the `FILE_CONFIGS` object in `/middleware/upload.js`:

```javascript
const FILE_CONFIGS = {
  // Existing fields...
  
  // New field example
  document: {
    allowedTypes: ['application/pdf', 'application/msword'],
    maxCount: 5,
    maxSize: 15 * 1024 * 1024, // 15MB
    errorMessage: 'Documents must be PDF or Word files'
  },
  
  gallery: {
    allowedTypes: ['image/jpeg', 'image/png'],
    maxCount: 20,
    maxSize: 8 * 1024 * 1024, // 8MB
    errorMessage: 'Gallery images must be JPEG or PNG'
  }
};
```

## File Naming Convention
Files are automatically renamed using the pattern:
```
{fieldName}_{sanitizedOriginalName}_{timestamp}-{random}.{extension}
```

Example: `icon_company_logo_1724855260123-987654321.png`

## Error Handling
The system provides specific error messages for:
- Unsupported file types
- File size exceeds limit
- Too many files uploaded
- Unsupported upload fields

## File Storage
All files are stored in `/uploads/files/` directory with public access via `/uploads/*` static route.

## Security Features
- File type validation by MIME type
- File size limits per field type
- Filename sanitization
- Automatic cleanup on upload errors
- Protected file paths
