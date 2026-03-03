const fs = require('fs');
const schema = fs.readFileSync('c:/Users/Admin/Documents/socity/socity-backend/prisma/schema.prisma', 'utf8');
const lines = schema.split('\n');
let modelStr = '';
let inModel = false;
for (const line of lines) {
    if (line.includes('model Visitor')) {
        inModel = true;
    }
    if (inModel) {
        modelStr += line + '\n';
        if (line.includes('}')) break;
    }
}
fs.writeFileSync('visitor_schema.txt', modelStr);
console.log('done');
process.exit(0);
