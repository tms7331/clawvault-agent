/**
 * ERC-8021 Builder Code helpers.
 *
 * Builder codes are appended to transaction calldata as a suffix:
 *   [codesLength: 1 byte][codes: N bytes ASCII][schemaId: 1 byte][marker: 16 bytes]
 *
 * The 16-byte marker 0x8021802180218021... allows backward-parsing to detect
 * the suffix without modifying existing contract logic.
 */

const ERC_8021_MARKER = "80218021802180218021802180218021";

/**
 * Encode a builder code into the ERC-8021 calldata suffix format (Schema 0).
 */
export function encodeBuilderCodeSuffix(builderCode: string): `0x${string}` {
  const codeBytes = new TextEncoder().encode(builderCode);
  const codesLength = codeBytes.length.toString(16).padStart(2, "0");
  const codesHex = Array.from(codeBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const schemaId = "00";
  return `0x${codesLength}${codesHex}${schemaId}${ERC_8021_MARKER}`;
}

/**
 * Append the builder code suffix to existing calldata.
 */
export function appendBuilderCode(
  calldata: `0x${string}`,
  builderCode: string
): `0x${string}` {
  const suffix = encodeBuilderCodeSuffix(builderCode);
  return `${calldata}${suffix.slice(2)}` as `0x${string}`;
}
