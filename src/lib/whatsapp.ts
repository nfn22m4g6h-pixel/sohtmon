/** Номер для wa.me: только цифры, для местных 9-значных номеров добавляется код Таджикистана 992 */
export function waPhone(phone: string | null | undefined) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `992${d}`;
  return d.length >= 10 ? d : "";
}

export function waLink(phone: string | null | undefined, text: string) {
  const p = waPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
