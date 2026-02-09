const fs = require('fs');
const path = require('path');

// ... (in Global Error Handler)
app.use((err, req, res, next) => {
  const log = `[${new Date().toISOString()}] Error: ${err.message}\nStack: ${err.stack}\n\n`;
  fs.appendFileSync(path.join(__dirname, 'crash.log'), log);
  
  console.error('Global Error Handler Caught:', err);
  res.status(500).json({ error: err.message, stack: err.stack });
});
