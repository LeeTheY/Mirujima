import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="미루지마 홈">
      <Image src="/icons/icon-192.png" alt="" width={34} height={34} priority />
      <span>Mirujima</span>
    </Link>
  );
}
