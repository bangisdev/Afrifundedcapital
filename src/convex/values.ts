/* eslint-disable @typescript-eslint/no-explicit-any */
function noop(): any {
  return undefined;
}

export const v = {
  id: noop,
  string: noop,
  number: noop,
  boolean: noop,
  object: noop,
  array: noop,
  union: noop,
  optional: noop,
  "null": noop,
  any: noop,
};
