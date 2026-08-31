import { rm } from "node:fs/promises";

async function main() {
  const { downloadYoutubeVideo } = await import("../src/lib/tools/youtube-download-server");
  const result = await downloadYoutubeVideo("https://www.youtube.com/watch?v=jNQXAC9IVRw");

  try {
    console.log(JSON.stringify({
      filename: result.filename,
      size: result.size,
      contentType: result.contentType,
    }));
  } finally {
    await rm(result.directory, { recursive: true, force: true });
  }
}

void main();
