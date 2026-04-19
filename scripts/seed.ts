import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rawData = `1	careers@nickelfox.com	Yes			
2	rai@silverlinktechnologies.com	Yes			
3	rahul@mydr24.co	yes			
4	hr@quickgick.com	yes			
5	venugopal.r@mgtechsoft.com	yes	ASE		
6	shivani.bisht@ivycomptech.com	yes	SDE		
7	komal.thapliyal@stercodigitex.com	yes	ReactJS		
8	Lakshmi.chaitanya@tescra.com	yes	Open		
9	aditchat@qti.qualcomm.com	yes	Open Ai/ML		
10	himanshu.tuteja@uber.com	yes	Full stack, SDE		
11	hr1@novoexcipient.com	yes	QA executive		
12	hr@wittybrains.com	yes	ReactJs		
13	hiring@heizen.work	yes	SDE		
14	careers@codingworkx.com	yes	Node Developer		
15	recruitment@a3logics.in	yes	Developer		
16	jagrati.mahawar@dianapps.com	yes	ReactJS		
17	hr@techanicinfotech.com	yes	Frontend and backend		
18	maria@bigbyteinsights.com	yes	Developer		
19	info@cupuletechnologies.us	yes	 ReactJs and Nodejs Developer		
20	vivranjan@ebay.com	yes	Full Stack, Java, ReactJs		
21	careers@phoenixsolutions.com	yes	SDE or Developer		
22	sujithak@kpit.com	yes	Developer		
23	falguni.deswal@freshgravity.com	yes	DEveloper		
24	hr@paywize.in	yes	Node Developer		
25	contact@hiringdog.com	yes	Developer		
26	recruiting@synergycom.com	yes	DEveloper		
27	Jobs@metapercept.com	yes	Developer		
28	ayushi.modi.ext@capgemini.com	yes	Developer SQL		
29	deanjohnjoseph@gmail.com	yes	Developer SQL		
30	archana.sharma@moglix.com	yes	Developer Full Stack (Immediate)		
31	venkatasai.chennupalle@gevernova.com	yes	Developer		
32	hr@smart10x.in	Yes	Full Stack		
33	yachika@eoxysit.com		MERN intern		
34	hr@stackguard.io		Application for Software Developer Intern (Golang)		
			Tester Intern		
			DevOps Engineer Intern		
35	hr@ssrana.in				
36	rajeshp@netfotech.in				
37	hr@wangoes.com				
38	hiring@radarsoft.tech				
39	Nitin.chaudhary@motherson.com 				
40	nidhi.kumari11@ibm.com				
41	megha.paul@digitalsherpa.ai				
42	shikha@questhiring.com				
43	anusha@sprintzeal.com		Junior MERN 		
44	hr@standardinsights.io		Frontend Dev intern		
45	hr@dwebbox.com		Full Stack Dev intern		
46	info@mapmytour.in		Backend dev intern		
47	harsh@idsolutionsindia.com		SDE Intern		
48	insoftlink.manager@gmail.com				
49	hiring@sophontai.com				
50	nancy@roxiler.com				
51	anish.jhalani@hexahealth.com				
52	shalini_mohan@intuit.com 	Yes			
53	careers@evoluxiontech.com				
54	hr@dripi.ing				
55	careers@tanvoralabs.com				
56	 tanishque.s@luckpay.in	Yes			
57	ayush.sharma@cabswale.in				
58	 swadhin.more@virtuecloud.io				
59	sanskriti@sbnri.com	Yes	Backend dev intern		
60	suraj.saxena@lenskart.com				
61	mahesh.pathade@ascendion.com				
62	kodeark.hr@outlook.com				
63	kritika@mailin.ai				
64	goutham.kumar@greenhonchos.com				
65	kajalthakur@optimhire.com				
66	hr@deeptek.ai		Full Stack Software Developer`;

async function main() {
  const lines = rawData.split("\n");
  const entriesToCreate = [];

  let lastEmail = "";

  for (const line of lines) {
    const parts = line.split("\t");
    
    // Skip empty filler lines that were just roles for Stackguard
    if (parts.length < 2 || (!parts[1] && parts[0] === "")) continue;

    const email = parts[1]?.trim();
    if (!email) continue;
    lastEmail = email;

    const sentStr = parts[2]?.trim().toLowerCase() === "yes";
    const status = sentStr ? "SENT" : "PENDING";
    
    const role = parts[3]?.trim() || "Software Developer"; // Default role if empty

    entriesToCreate.push({
      hrEmail: email,
      companyName: "",
      role: role,
      emailType: "APPLICATION",
      status: status,
      scheduledAt: new Date(),
      lastSentAt: sentStr ? new Date() : null,
    });
  }

  console.log(`Parsed ${entriesToCreate.length} entries. Seeding to MongoDB...`);

  // We loop because createMany is slightly different or not always supported depending on MongoDB cluster limits
  let count = 0;
  for (const entry of entriesToCreate) {
    await prisma.emailEntry.create({
      data: entry
    });
    count++;
  }

  console.log(`Successfully seeded ${count} emails!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
