import bcrypt from 'bcrypt';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('usage: npm run hash-password "<password>"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log(hash);
}

main();
