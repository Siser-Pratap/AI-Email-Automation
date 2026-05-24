import fs from "fs";
import path from "path";

export function getBestResumeForRole(role: string): { filename: string; path: string; contentType: string } | null {
  try {
    const metaPath = path.join(process.cwd(), "resumes_meta.json");
    // Fallback if no resumes_meta.json exists
    if (!fs.existsSync(metaPath)) {
      const fallbackPath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
      if (fs.existsSync(fallbackPath)) {
        return {
          filename: "Siser_Pratap_Software_Developer.pdf",
          path: fallbackPath,
          contentType: "application/pdf",
        };
      }
      return null;
    }
    
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    if (!meta || !Array.isArray(meta) || meta.length === 0) {
      // Fallback
      const fallbackPath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
      if (fs.existsSync(fallbackPath)) {
        return {
          filename: "Siser_Pratap_Software_Developer.pdf",
          path: fallbackPath,
          contentType: "application/pdf",
        };
      }
      return null;
    }
    
    // Sort by uploadedAt descending to prefer newer resumes when scores tie
    meta.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // Basic scoring based on word match
    const roleWords = (role || "").toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    
    let bestMatch = meta[0];
    let highestScore = -1;

    for (const resume of meta) {
      let score = 0;
      const titleWords = (resume.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      const descWords = (resume.description || "").toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      
      for (const rw of roleWords) {
        if (titleWords.includes(rw)) score += 2;
        if (descWords.includes(rw)) score += 1;
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = resume;
      }
    }

    const resumeStoragePath = path.join(process.cwd(), "public", "resumes", bestMatch.filename);
    if (!fs.existsSync(resumeStoragePath)) {
       // fallback to project root resume
      const fallbackPath = path.join(process.cwd(), "Siser_Pratap_Software_Developer.pdf");
      if (fs.existsSync(fallbackPath)) {
        return {
          filename: "Siser_Pratap_Software_Developer.pdf",
          path: fallbackPath,
          contentType: "application/pdf",
        };
      }
      return null;
    }

    // Format the display filename as Siser_Pratap_{Role} using the resume's title
    const sanitizedTitle = (bestMatch.title || "Software_Developer").replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const displayFilename = `Siser_Pratap_${sanitizedTitle}.pdf`;

    return {
      filename: displayFilename,
      path: resumeStoragePath,
      contentType: "application/pdf"
    };
  } catch (e) {
    console.error("Error matching resume:", e);
    return null;
  }
}
