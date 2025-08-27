"use client";
import dynamic from "next/dynamic";

const AudioUpload = dynamic(() => import("./components/AudioUpload"), { ssr: false });

export default function Home() {
  return (
    <main className="min-h-screen w-full p-6 sm:p-10">
      <div className="mx-auto max-w-3xl h-[80vh]">
        <AudioUpload />
      </div>
    </main>
  );
}
