const bcrypt = require('bcryptjs');

async function test() {
  const password = 'test123';
  const hash = await bcrypt.hash(password, 10);
  console.log('Password:', password);
  console.log('Hash:', hash);
  
  // Test it works
  const valid = await bcrypt.compare(password, hash);
  console.log('Valid?', valid);
}

test();
