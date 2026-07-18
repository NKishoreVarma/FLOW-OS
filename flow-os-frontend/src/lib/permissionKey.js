/** Stable identity for a permission row: type + provider-native id. */
export const key = (r) => `${r.resourceType}:${r.resourceId}`;

export default key;
