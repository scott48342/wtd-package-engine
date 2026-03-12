const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
process.stdout.write(fs.readFileSync(schemaPath, 'utf8'));
