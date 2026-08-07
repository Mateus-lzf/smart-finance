export const PRODUCT_NAME = "Smart Finance";

export function productTitle(section?: string) {
  return section ? `${section} — ${PRODUCT_NAME}` : PRODUCT_NAME;
}
