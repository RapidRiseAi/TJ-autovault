export function splitBillingAddress(address: string | null | undefined) {
  const parts = (address ?? '')
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    street: parts[0] ?? '',
    city: parts[1] ?? '',
    province: parts[2] ?? '',
    postalCode: parts[3] ?? ''
  };
}

export function composeBillingAddress({
  street,
  city,
  province,
  postalCode
}: {
  street: string;
  city: string;
  province: string;
  postalCode: string;
}) {
  const lineOne = street.trim();
  const lineTwo = [city, province, postalCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
  return [lineOne, lineTwo].filter(Boolean).join('\n');
}
