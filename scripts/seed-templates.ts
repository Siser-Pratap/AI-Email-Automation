import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const applicationHtml = `<p>Hi {{name}},</p>
<p>I'm Siser Pratap, a <strong>Full Stack & AI Engineer</strong> with experience building scalable backend systems, clean frontends, and AI-driven solutions in production.</p>
<p>I have <strong>3 months of full-time and 10 months of internship experience</strong>, and have worked on <strong>Full-stack + AI projects</strong> using <strong>MERN, Gen-AI, Python</strong> focused on secure architectures and intelligent automation. I've solved <strong>600+ DSA Questions</strong> and have a <strong>1500+ Leetcode rating</strong>.</p>
<p>I'd welcome the opportunity to contribute by building scalable features and leveraging AI to improve efficiency at {{company}}.</p>
<p>Please find my resume attached. I look forward to hearing from you.</p>
<p>Thanks and regards,<br>Siser Pratap</p>`;

  const referralHtml = `<p>Hi {{name}},</p>
<p>I'm Siser Pratap, a <strong>Full Stack & AI Engineer</strong> with experience building scalable backend systems, clean frontends, and AI-driven solutions in production.</p>
<p>I came across the {{role}} opening at {{company}} (Job ID: {{jobId}}) and believe my background makes me a strong fit.</p>
<p>I have <strong>3 months of full-time and 10 months of internship experience</strong>, and have worked on <strong>Full-stack + AI projects</strong> using <strong>MERN, Gen-AI, Python</strong>. I've solved <strong>600+ DSA Questions</strong> and have a <strong>1500+ Leetcode rating</strong>.</p>
<p>I'd really appreciate it if you could refer me for this position.</p>
<p>Please find my resume attached. I look forward to hearing from you.</p>
<p>Thanks and regards,<br>Siser Pratap</p>`;

  const interestHtml = `<p>Hi {{name}},</p>
<p>I'm Siser Pratap, a <strong>Full Stack & AI Engineer</strong> with experience building scalable backend systems, clean frontends, and AI-driven solutions in production.</p>
<p>I have <strong>3 months of full-time and 10 months of internship experience</strong>, and have worked on <strong>Full-stack + AI projects</strong> using <strong>MERN, Gen-AI, Python</strong>. I've solved <strong>600+ DSA Questions</strong> and have a <strong>1500+ Leetcode rating</strong>.</p>
<p>I am exploring new software development opportunities and would love to know if there are any openings on your team at {{company}}.</p>
<p>Please find my resume attached. I look forward to hearing from you.</p>
<p>Thanks and regards,<br>Siser Pratap</p>`;

  console.log("Seeding templates...");

  await prisma.emailTemplate.upsert({
    where: { type: "APPLICATION" },
    update: { subject: "Application for the {{role}} Developer", body: applicationHtml },
    create: { type: "APPLICATION", subject: "Application for the {{role}} Developer", body: applicationHtml },
  });

  await prisma.emailTemplate.upsert({
    where: { type: "REFERRAL" },
    update: { subject: "Referral Request for {{role}} at {{company}}", body: referralHtml },
    create: { type: "REFERRAL", subject: "Referral Request for {{role}} at {{company}}", body: referralHtml },
  });

  await prisma.emailTemplate.upsert({
    where: { type: "INTEREST" },
    update: { subject: "Exploring Software Development Opportunities", body: interestHtml },
    create: { type: "INTEREST", subject: "Exploring Software Development Opportunities", body: interestHtml },
  });

  console.log("Templates seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
