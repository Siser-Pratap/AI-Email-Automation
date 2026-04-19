import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const followUpHtml = `<p>Hi {{name}},</p>
<p>I hope you are doing well!</p>
<p>I am following up on my previous message regarding the {{role}} position at {{company}}. I'm still very interested in the opportunity and would love to connect.</p>
<p>Please let me know if there are any updates or if you need any additional information from me.</p>
<p>Thanks and regards,<br>Siser Pratap</p>`;

  await prisma.emailTemplate.upsert({
    where: { type: "FOLLOWUP" },
    update: { subject: "Following up: {{role}} at {{company}}", body: followUpHtml },
    create: { type: "FOLLOWUP", subject: "Following up: {{role}} at {{company}}", body: followUpHtml },
  });

  console.log("Follow-up template seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
