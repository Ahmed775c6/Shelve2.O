const lowercase = "abcdefghijkmnopqrstuvwxyz";
const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const digits = "23456789";
const symbols = "!@#$%^&*()-_=+[]{}?";
const alphabet = lowercase + uppercase + digits + symbols;

function randomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const byte = new Uint8Array(1);
  do {
    crypto.getRandomValues(byte);
  } while (byte[0] >= limit);
  return byte[0] % max;
}

function randomCharacter(characters: string): string {
  return characters[randomIndex(characters.length)];
}

export function generateSecurePassword(length = 20): string {
  if (!Number.isInteger(length) || length < 12 || length > 128) {
    throw new RangeError("Password length must be between 12 and 128 characters.");
  }
  const password = [
    randomCharacter(lowercase),
    randomCharacter(uppercase),
    randomCharacter(digits),
    randomCharacter(symbols),
  ];
  while (password.length < length) password.push(randomCharacter(alphabet));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join("");
}
