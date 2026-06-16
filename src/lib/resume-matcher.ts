import { prisma } from "@/lib/prisma";

function toDriveDownloadUrl(url: string): string {
  const match = url.match(/\/file\/d\/([^/?]+)/);
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  return url;
}

export async function getBestResumeForRole(
  role: string
): Promise<{ filename: string; href: string; contentType: string } | null> {
  try {
    const resumes = await prisma.resume.findMany({ orderBy: { uploadedAt: "desc" } });
    if (!resumes.length) return null;

    const roleWords = (role || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let bestMatch = resumes[0];
    let highestScore = -1;

    for (const resume of resumes) {
      let score = 0;
      const titleWords = (resume.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
      const descWords = (resume.description || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);

      for (const rw of roleWords) {
        if (titleWords.includes(rw)) score += 2;
        if (descWords.includes(rw)) score += 1;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = resume;
      }
    }

    const sanitizedTitle = (bestMatch.title || "Software_Developer")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const displayFilename = `Siser_Pratap_${sanitizedTitle}.pdf`;

    return {
      filename: displayFilename,
      href: toDriveDownloadUrl(bestMatch.driveUrl),
      contentType: "application/pdf",
    };
  } catch (e) {
    console.error("Error matching resume:", e);
    return null;
  }
}
