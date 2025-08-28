const { FILE_CONFIGS } = require('./middleware/upload');

console.log('📋 File Upload Configuration:');
console.log('============================');

Object.entries(FILE_CONFIGS).forEach(([fieldName, config]) => {
  console.log(`\n🔑 Field: "${fieldName}"`);
  console.log(`   📁 Allowed types: ${config.allowedTypes.join(', ')}`);
  console.log(`   📊 Max count: ${config.maxCount}`);
  console.log(`   💾 Max size: ${(config.maxSize / (1024 * 1024)).toFixed(1)}MB`);
  console.log(`   ❌ Error message: ${config.errorMessage}`);
});

console.log('\n✅ Upload system is ready!');
console.log('\n📝 Usage example:');
console.log('POST /api/upload');
console.log('FormData fields:');
console.log('- icon: image file (max 1, up to 5MB)');
console.log('- project_attachment: PDF file (max 10, up to 10MB each)');
console.log('- avatar: image file (max 1, up to 3MB)');
console.log('\n🔄 Response will contain the same field names with file URLs');
