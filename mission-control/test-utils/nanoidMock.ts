/**
 * CommonJS-compatible nanoid mock for Jest.
 *
 * nanoid v5 ships as pure ESM, which ts-jest (node env) cannot transform from
 * node_modules. Tests only need a unique-ish id, so this stand-in is sufficient.
 */
export const nanoid = (size = 21): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  for (let i = 0; i < size; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
};
