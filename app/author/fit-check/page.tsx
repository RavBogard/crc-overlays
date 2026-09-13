import type { Metadata } from "next";
import FitCheckClient from "./fit-check-client";

export const metadata: Metadata = { title: "Rendered catalog fit check" };

export default function FitCheckPage() {
  return <FitCheckClient />;
}
