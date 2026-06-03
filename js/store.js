// Database Store Layer for LocalStorage

const STORE_KEYS = {
    QUESTIONS: 'army_exam_questions',
    USERS: 'army_exam_users',
    ATTEMPTS: 'army_exam_attempts',
    CONFIG: 'army_exam_config'
};

// Seed questions (Default question bank)
const DEFAULT_QUESTIONS = [
    // MATHEMATICS (คณิตศาสตร์)
    {
        id: 'm1',
        subject: 'คณิตศาสตร์',
        question: 'โรงเรียนทหารแห่งหนึ่งมีนักเรียนทั้งหมด 1,200 นาย เป็นนักเรียนเตรียมทหาร 45% ที่เหลือเป็นนักเรียนนายสิบ อยากทราบว่ามีนักเรียนนายสิบกี่นาย',
        options: {
            A: '540 นาย',
            B: '660 นาย',
            C: '720 นาย',
            D: '780 นาย'
        },
        correct: 'B',
        explanation: 'นักเรียนนายสิบคิดเป็น 100% - 45% = 55% ของทั้งหมด ดังนั้น จำนวนนักเรียนนายสิบ = (55 / 100) * 1,200 = 0.55 * 1,200 = 660 นาย'
    },
    {
        id: 'm2',
        subject: 'คณิตศาสตร์',
        question: 'เสบียงอาหารกองหนึ่งเลี้ยงทหาร 80 คน ได้นาน 15 วัน หากมีกำลังพลสมทบเพิ่มอีก 20 คน เสบียงอาหารนี้จะเลี้ยงทหารได้กี่วัน (กำหนดให้ทุกคนกินอาหารอัตราเท่ากัน)',
        options: {
            A: '12 วัน',
            B: '10 วัน',
            C: '9 วัน',
            D: '8 วัน'
        },
        correct: 'A',
        explanation: 'เป็นโจทย์สัดส่วนผกผัน: ทหาร 80 คน กินได้ 15 วัน รวมทั้งหมดมีเสบียง = 80 * 15 = 1,200 วัน-คน เมื่อมีทหารเพิ่มอีก 20 คน รวมเป็น 100 คน เสบียงจะเลี้ยงได้ = 1,200 / 100 = 12 วัน'
    },
    {
        id: 'm3',
        subject: 'คณิตศาสตร์',
        question: 'สมชายเดินทางไปค่ายฝึกทหารด้วยความเร็ว 60 กม./ชม. ขากลับเดินทางเส้นทางเดิมด้วยความเร็ว 40 กม./ชม. ความเร็วเฉลี่ยของการเดินทางไป-กลับเท่ากับเท่าใด',
        options: {
            A: '50 กม./ชม.',
            B: '48 กม./ชม.',
            C: '46 กม./ชม.',
            D: '45 กม./ชม.'
        },
        correct: 'B',
        explanation: 'ความเร็วเฉลี่ยไป-กลับ = (2 * v1 * v2) / (v1 + v2) = (2 * 60 * 40) / (60 + 40) = 4800 / 100 = 48 กม./ชม.'
    },
    {
        id: 'm4',
        subject: 'คณิตศาสตร์',
        question: 'สนามหญ้ารูปสี่เหลี่ยมผืนผ้ามีความกว้าง 15 เมตร ยาว 20 เมตร ต้องการทำทางเดินรอบสนามหญ้ากว้าง 1 เมตร พื้นที่ของทางเดินรอบสนามหญ้าเป็นกี่ตารางเมตร',
        options: {
            A: '74 ตารางเมตร',
            B: '70 ตารางเมตร',
            C: '78 ตารางเมตร',
            D: '82 ตารางเมตร'
        },
        correct: 'A',
        explanation: 'พื้นที่สนามเดิม = 15 * 20 = 300 ตร.ม. เมื่อมีทางเดินกว้าง 1 เมตร ขนาดสนามรวมทางเดินจะกว้าง 15+2 = 17 เมตร และยาว 20+2 = 22 เมตร พื้นที่รวม = 17 * 22 = 374 ตร.ม. ดังนั้น พื้นที่ทางเดิน = 374 - 300 = 74 ตร.ม.'
    },
    {
        id: 'm5',
        subject: 'คณิตศาสตร์',
        question: 'เลขสองจำนวนมี ห.ร.ม. เท่ากับ 6 และ ค.ร.น. เท่ากับ 72 ถ้าเลขจำนวนหนึ่งคือ 18 อีกจำนวนหนึ่งคือข้อใด',
        options: {
            A: '24',
            B: '32',
            C: '36',
            D: '48'
        },
        correct: 'A',
        explanation: 'ความสัมพันธ์ระหว่าง ห.ร.ม. และ ค.ร.น.: ผลคูณของเลขสองจำนวน = ห.ร.ม. * ค.ร.น. ดังนั้น 18 * x = 6 * 72 -> x = (6 * 72) / 18 = 432 / 18 = 24'
    },
    {
        id: 'm6',
        subject: 'คณิตศาสตร์',
        question: 'ถังน้ำมีท่อเปิดน้ำเข้าเต็มถังในเวลา 4 ชั่วโมง และมีท่อระบายน้ำก้นถังปล่อยน้ำหมดถังในเวลา 6 ชั่วโมง ถ้าถังว่างเปล่าแล้วเปิดทั้งสองท่อพร้อมกัน น้ำจะเต็มถังในเวลากี่ชั่วโมง',
        options: {
            A: '8 ชั่วโมง',
            B: '10 ชั่วโมง',
            C: '12 ชั่วโมง',
            D: '14 ชั่วโมง'
        },
        correct: 'C',
        explanation: 'ใน 1 ชั่วโมง ท่อน้ำเข้าได้น้ำ 1/4 ของถัง ท่อน้ำระบายออกได้ 1/6 ของถัง เมื่อเปิดร่วมกันจะได้น้ำ (1/4) - (1/6) = (3 - 2)/12 = 1/12 ของถัง ดังนั้น น้ำจะเต็มถังในเวลา 12 ชั่วโมง'
    },
    {
        id: 'm7',
        subject: 'คณิตศาสตร์',
        question: 'อัตราส่วนอายุของพ่อยกับลูกเป็น 7 : 3 ถ้าพ่อมีอายุมากกว่าลูก 24 ปี ปัจจุบันลูกมีอายุกี่ปี',
        options: {
            A: '15 ปี',
            B: '18 ปี',
            C: '21 ปี',
            D: '24 ปี'
        },
        correct: 'B',
        explanation: 'ส่วนต่างอัตราส่วนคือ 7 - 3 = 4 ส่วน ซึ่งคิดเป็นอายุ 24 ปี ดังนั้น 1 ส่วน = 24 / 4 = 6 ปี อายุของลูกคือ 3 ส่วน = 3 * 6 = 18 ปี'
    },
    {
        id: 'm8',
        subject: 'คณิตศาสตร์',
        question: 'ปืนใหญ่ยิงกระสุนออกไปด้วยความเร็วต้น 300 เมตรต่อวินาที ทำมุม 30 องศากับแนวราบ กระสุนปืนใหญ่จะลอยอยู่ในอากาศนานกี่วินาที (กำหนด g = 10 m/s²)',
        options: {
            A: '15 วินาที',
            B: '20 วินาที',
            C: '30 วินาที',
            D: '45 วินาที'
        },
        correct: 'C',
        explanation: 'สูตรเวลาการเคลื่อนที่วิถีโค้ง t = (2 * u * sin(theta)) / g = (2 * 300 * sin(30°)) / 10 = (600 * 0.5) / 10 = 300 / 10 = 30 วินาที'
    },
    {
        id: 'm9',
        subject: 'คณิตศาสตร์',
        question: 'ซื้อปืนสั้นมาราคา 25,000 บาท ขายต่อให้เพื่อนในราคา 28,500 บาท ได้กำไรคิดเป็นกี่เปอร์เซ็นต์',
        options: {
            A: '12%',
            B: '14%',
            C: '15%',
            D: '18%'
        },
        correct: 'B',
        explanation: 'กำไรที่ได้ = 28,500 - 25,000 = 3,500 บาท คิดเป็นร้อยละ = (3,500 / 25,000) * 100 = 14%'
    },
    {
        id: 'm10',
        subject: 'คณิตศาสตร์',
        question: 'โยนลูกเต๋าที่เที่ยงตรง 2 ลูกพร้อมกัน 1 ครั้ง ความน่าจะเป็นที่ผลรวมแต้มบนหน้าลูกเต๋ารวมกันได้ 8 เท่ากับข้อใด',
        options: {
            A: '5/36',
            B: '1/6',
            C: '7/36',
            D: '5/12'
        },
        correct: 'A',
        explanation: 'จำนวนผลลัพธ์ทั้งหมด (Sample space) = 6 * 6 = 36 แบบ ผลรวมได้ 8 มีกรณีดังนี้: (2,6), (3,5), (4,4), (5,3), (6,2) ทั้งหมด 5 กรณี ความน่าจะเป็นจึงเท่ากับ 5/36'
    },

    // ENGLISH (ภาษาอังกฤษ)
    {
        id: 'e1',
        subject: 'ภาษาอังกฤษ',
        question: 'The army sergeant ordered his soldiers ________ the military barracks immediately.',
        options: {
            A: 'cleaning',
            B: 'clean',
            C: 'to clean',
            D: 'cleaned'
        },
        correct: 'C',
        explanation: 'โครงสร้างประโยคสั่งการ/ขอร้อง: order + someone + to-infinitive (to + verb ช่อง 1) ดังนั้นต้องใช้ "to clean"'
    },
    {
        id: 'e2',
        subject: 'ภาษาอังกฤษ',
        question: 'If the captain ________ the map, we would not have gotten lost in the jungle.',
        options: {
            A: 'reads',
            B: 'has read',
            C: 'read',
            D: 'had read'
        },
        correct: 'D',
        explanation: 'เป็นประโยคเงื่อนไขแบบที่ 3 (Third Conditional - สมมติเรื่องในอดีตที่เป็นไปไม่ได้แล้ว): If + Past Perfect (had + V.3), Subject + would have + V.3 ดังนั้นใช้ "had read"'
    },
    {
        id: 'e3',
        subject: 'ภาษาอังกฤษ',
        question: 'Choose the word that is closest in meaning to "CANDIDATE".',
        options: {
            A: 'Applicant',
            B: 'Officer',
            C: 'Commander',
            D: 'Instructor'
        },
        correct: 'A',
        explanation: 'Candidate แปลว่า ผู้สมัคร/ผู้เข้าสอบ ซึ่งมีความหมายใกล้เคียงที่สุดกับ Applicant (ผู้สมัคร)'
    },
    {
        id: 'e4',
        subject: 'ภาษาอังกฤษ',
        question: 'The new military equipment was ________ tested before being sent to the battlefield.',
        options: {
            A: 'rigorous',
            B: 'rigorously',
            C: 'rigor',
            D: 'rigorousness'
        },
        correct: 'B',
        explanation: 'ประโยคต้องการขยายคำกริยา "tested" (ได้รับการทดสอบ) จึงต้องใช้คำกริยาวิเศษณ์ (Adverb) คือ "rigorously" ซึ่งแปลว่า อย่างเข้มงวด/อย่างเข้มข้น'
    },
    {
        id: 'e5',
        subject: 'ภาษาอังกฤษ',
        question: 'Neither the commander nor the soldiers ________ present at the briefing yesterday morning.',
        options: {
            A: 'was',
            B: 'were',
            C: 'are',
            D: 'is'
        },
        correct: 'B',
        explanation: 'กฎการใช้ "Neither... nor...": คำกริยาจะผันตามประธานตัวที่อยู่ใกล้กริยาที่สุด ในที่นี้คือ "the soldiers" (พหูพจน์) และระบุเวลาอดีต "yesterday" ดังนั้นกริยาอดีตพหูพจน์คือ "were"'
    },
    {
        id: 'e6',
        subject: 'ภาษาอังกฤษ',
        question: 'Military officers are expected to show complete loyalty. What is the antonym of "LOYALTY"?',
        options: {
            A: 'Faithfulness',
            B: 'Treason',
            C: 'Devotion',
            D: 'Obedience'
        },
        correct: 'B',
        explanation: 'Antonym (คำตรงข้าม) ของ Loyalty (ความจงรักภักดี) คือ Treason (การกบฏ/การทรยศต่อชาติ)'
    },
    {
        id: 'e7',
        subject: 'ภาษาอังกฤษ',
        question: 'They have been marching ________ six hours without taking any break.',
        options: {
            A: 'since',
            B: 'for',
            C: 'during',
            D: 'until'
        },
        correct: 'B',
        explanation: 'ใช้ "for" นำหน้าช่วงเวลา (Duration) ในที่นี้คือ "six hours" (เป็นเวลา 6 ชั่วโมง) ส่วน "since" จะนำหน้าจุดเริ่มต้นของเวลา'
    },
    {
        id: 'e8',
        subject: 'ภาษาอังกฤษ',
        question: 'The military base ________ by high-voltage fences and security cameras.',
        options: {
            A: 'is surrounded',
            B: 'surrounds',
            C: 'has surrounded',
            D: 'is surrounding'
        },
        correct: 'A',
        explanation: 'ประโยคต้องการสื่อความหมายว่า ฐานทัพทหารถูกล้อมรอบ (Passive Voice): Subject + is/am/are + V.3 ดังนั้นตอบ "is surrounded"'
    },
    {
        id: 'e9',
        subject: 'ภาษาอังกฤษ',
        question: 'We look forward to ________ the joint military exercise next month.',
        options: {
            A: 'join',
            B: 'joined',
            C: 'joining',
            D: 'joins'
        },
        correct: 'C',
        explanation: 'สำนวน "look forward to" ต้องตามด้วยคำนามหรือกริยาเติม ing (Gerund) เสมอ ดังนั้นจึงต้องใช้ "joining"'
    },
    {
        id: 'e10',
        subject: 'ภาษาอังกฤษ',
        question: 'Which of the following sentences is grammatically correct?',
        options: {
            A: 'He speak Thai and English very good.',
            B: 'He speaks Thai and English very well.',
            C: 'He speaks Thai and English very good.',
            D: 'He speak Thai and English very well.'
        },
        correct: 'B',
        explanation: 'ประธานเอกพจน์ He กริยาเติม s คือ speaks และขยายกริยาการพูดพูดได้ดีต้องใช้ Adverb คือ "well" (ไม่ใช่ good ซึ่งเป็น Adjective)'
    },

    // GENERAL KNOWLEDGE (ความรู้ทั่วไป/กฎหมาย)
    {
        id: 'g1',
        subject: 'ความรู้ทั่วไป',
        question: 'ผู้บัญชาการทหารสูงสุด (ผบ.สส.) คนปัจจุบันของกองทัพไทย มีวาระการดำรงตำแหน่งสูงสุดจนถึงอายุกี่ปี ตามกฎหมายข้าราชการทหาร',
        options: {
            A: '55 ปี',
            B: '60 ปี',
            C: '63 ปี',
            D: '65 ปี'
        },
        correct: 'B',
        explanation: 'ข้าราชการทหารและข้าราชการพลเรือนสามัญทั่วไปในประเทศไทย มีวาระเกษียณอายุราชการเมื่ออายุครบ 60 ปีบริบูรณ์'
    },
    {
        id: 'g2',
        subject: 'ความรู้ทั่วไป',
        question: 'ยศทหารบกสัญญาบัตรข้อใดต่อไปนี้ มีลำดับสูงที่สุดตามทำเนียบยศข้าราชการกองทัพบกไทย',
        options: {
            A: 'พันโท (Lieutenant Colonel)',
            B: 'พันเอก (Colonel)',
            C: 'ร้อยเอก (Captain)',
            D: 'พันตรี (Major)'
        },
        correct: 'B',
        explanation: 'เรียงลำดับยศทหารบกจากสูงไปต่ำตามตัวเลือก: พันเอก > พันโท > พันตรี > ร้อยเอก'
    },
    {
        id: 'g3',
        subject: 'ความรู้ทั่วไป',
        question: 'สงครามโลกครั้งที่สอง (World War II) สิ้นสุดลงอย่างเป็นทางการในคริสต์ศักราชใด',
        options: {
            A: 'ค.ศ. 1918',
            B: 'ค.ศ. 1939',
            C: 'ค.ศ. 1945',
            D: 'ค.ศ. 1950'
        },
        correct: 'C',
        explanation: 'สงครามโลกครั้งที่สองเริ่มต้นใน ค.ศ. 1939 และสิ้นสุดลงอย่างเป็นทางการใน ค.ศ. 1945 หลังจากญี่ปุ่นลงนามยอมจำนนในเดือนกันยายน'
    },
    {
        id: 'g4',
        subject: 'ความรู้ทั่วไป',
        question: 'กฎอัยการศึก (Martial Law) ตามพระราชบัญญัติกฎอัยการศึก พระพุทธศักราช 2457 มีผลบังคับใช้เมื่อได้รับการประกาศโดยใครในกรณีฉุกเฉินระดับประเทศ',
        options: {
            A: 'ผู้บัญชาการทหารบก หรือผู้ดำรงตำแหน่งผู้บัญชาการทหารในพื้นที่',
            B: 'นายกรัฐมนตรี',
            C: 'ประธานรัฐสภา',
            D: 'ผู้ว่าราชการจังหวัด'
        },
        correct: 'A',
        explanation: 'ตาม พ.ร.บ.กฎอัยการศึก พ.ศ. 2457 มาตรา 4 ระบุว่า เมื่อมีสงครามหรือจลาจล เจ้าหน้าที่ฝ่ายทหารผู้ปกครองท้องถิ่นระดับผู้บัญชาการทหารขึ้นไป มีอำนาจประกาศกฎอัยการศึกในเขตอำนาจได้ทันที'
    },
    {
        id: 'g5',
        subject: 'ความรู้ทั่วไป',
        question: 'พระราชบัญญัติรับราชการทหาร พ.ศ. 2497 กำหนดให้ชายไทยที่มีสัญชาติไทยต้องไปแสดงตนเพื่อลงบัญชีทหารกองเกินในพุทธศักราชที่ตนมีอายุย่างเข้ากี่ปี',
        options: {
            A: 'อายุย่างเข้า 18 ปี',
            B: 'อายุย่างเข้า 21 ปี',
            C: 'อายุย่างเข้า 20 ปี',
            D: 'อายุย่างเข้า 25 ปี'
        },
        correct: 'A',
        explanation: 'ชายไทยต้องไปลงบัญชีทหารกองเกิน (ลงทะเบียนทหาร) ณ อำเภอท้องที่ภูมิลำเนาในศักราชที่ตนมีอายุย่างเข้า 18 ปี (อายุครบ 17 ปีบริบูรณ์)'
    },
    {
        id: 'g6',
        subject: 'ความรู้ทั่วไป',
        question: 'องค์การระหว่างประเทศใดต่อไปนี้จัดตั้งขึ้นภายหลังสงครามโลกครั้งที่ 2 เพื่อรักษาสันติภาพและความมั่นคงระหว่างประเทศ',
        options: {
            A: 'องค์การสันนิบาตชาติ (League of Nations)',
            B: 'องค์การสหประชาชาติ (United Nations - UN)',
            C: 'สหภาพยุโรป (European Union)',
            D: 'องค์การสนธิสัญญาแอตแลนติกเหนือ (NATO)'
        },
        correct: 'B',
        explanation: 'องค์การสหประชาชาติ (UN) ก่อตั้งขึ้นในวันที่ 24 ตุลาคม ค.ศ. 1945 หลังสงครามโลกครั้งที่ 2 สิ้นสุดลง เพื่อแทนที่องค์การสันนิบาตชาติที่จัดตั้งหลังสงครามโลกครั้งที่ 1'
    },
    {
        id: 'g7',
        subject: 'ความรู้ทั่วไป',
        question: 'จังหวัดใดในประเทศไทยที่มีพื้นที่ทางภูมิศาสตร์ขนาดใหญ่ที่สุด',
        options: {
            A: 'นครราชสีมา',
            B: 'เชียงใหม่',
            C: 'กาญจนบุรี',
            D: 'ตาก'
        },
        correct: 'A',
        explanation: 'จังหวัดนครราชสีมา (โคราช) มีพื้นที่ขนาดใหญ่ที่สุดในประเทศไทย (ประมาณ 20,494 ตร.กม.) ตามด้วยจังหวัดเชียงใหม่ และกาญจนบุรี'
    },
    {
        id: 'g8',
        subject: 'ความรู้ทั่วไป',
        question: 'วัคซีนป้องกันโรคติดเชื้อไวรัสโคโรนา 2019 (COVID-19) ชนิดแรกที่ได้รับการอนุมัติให้ใช้ในวงกว้างระดับสากลพัฒนาขึ้นโดยใช้เทคโนโลยีใดเป็นหลัก',
        options: {
            A: 'เชื้อตาย (Inactivated)',
            B: 'เอ็มอาร์เอ็นเอ (mRNA)',
            C: 'โปรตีนซับยูนิต (Protein Subunit)',
            D: 'ไวรัลเวกเตอร์ (Viral Vector)'
        },
        correct: 'B',
        explanation: 'วัคซีน Pfizer-BioNTech และ Moderna ซึ่งเป็นวัคซีนแรกๆ ที่ใช้ในวงกว้าง พัฒนาขึ้นโดยใช้เทคโนโลยี mRNA (messenger Ribonucleic Acid)'
    },
    {
        id: 'g9',
        subject: 'ความรู้ทั่วไป',
        question: 'วันสถาปนากองทัพไทย ซึ่งตรงกับวันที่สมเด็จพระนเรศวรมหาราชทรงกระทำยุทธหัตถีมีชัยชนะเหนือกองทัพพม่า ตรงกับวันใดของทุกปี',
        options: {
            A: '18 มกราคม',
            B: '25 มกราคม',
            C: '6 เมษายน',
            D: '23 ตุลาคม'
        },
        correct: 'A',
        explanation: 'วันกองทัพไทย ถูกเปลี่ยนมาตรงกับวันที่ 18 มกราคม ของทุกปี เพื่อให้สอดคล้องกับผลการคำนวณวันกระทำยุทธหัตถีจริงในประวัติศาสตร์'
    },
    {
        id: 'g10',
        subject: 'ความรู้ทั่วไป',
        question: 'ประเทศใดในเอเชียตะวันออกเฉียงใต้ (ASEAN) ที่ไม่ได้มีพรมแดนติดต่อทางบกกับประเทศไทย',
        options: {
            A: 'กัมพูชา',
            B: 'ลาว',
            C: 'เวียดนาม',
            D: 'มาเลเซีย'
        },
        correct: 'C',
        explanation: 'เวียดนามไม่มีพรมแดนทางบกติดต่อกับไทยโดยตรง (มีประเทศลาวและกัมพูชาคั่นกลาง) ส่วนกัมพูชา ลาว และมาเลเซียมีพรมแดนติดกับไทย'
    }
];

// Seed users
const DEFAULT_USERS = [
    {
        gmail: 'admin@gmail.com',
        password: 'admin123',
        name: 'แอดมิน ผู้ดูแลระบบ',
        role: 'admin'
    },
    {
        gmail: 'candidate@gmail.com',
        password: '123',
        name: 'ส.ต. สมหมาย ใฝ่เรียนรู้',
        role: 'candidate'
    }
];

// Seed exam configuration (Questions per subject)
const DEFAULT_CONFIG = {
    'คณิตศาสตร์': 5,
    'ภาษาอังกฤษ': 5,
    'ความรู้ทั่วไป': 5,
    'durationMinutes': 180, // 3 hours in minutes
    'subjectOrder': ['คณิตศาสตร์', 'ภาษาอังกฤษ', 'ความรู้ทั่วไป']
};

// Local In-Memory Cache for server sync
let localCache = {
    questions: [],
    users: [],
    config: {},
    attempts: [],
    dbSizeBytes: 0
};

// Sync from backend
export async function syncFromBackend() {
    try {
        const response = await fetch('/api/db');
        if (response.ok) {
            const data = await response.json();
            localCache.questions = data.questions || [];
            localCache.users = data.users || [];
            localCache.config = data.config || {};
            localCache.attempts = data.attempts || [];
            localCache.dbSizeBytes = data.db_size_bytes || 0;
            
            // Backup to localStorage
            localStorage.setItem(STORE_KEYS.QUESTIONS, JSON.stringify(localCache.questions));
            localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(localCache.users));
            localStorage.setItem(STORE_KEYS.CONFIG, JSON.stringify(localCache.config));
            localStorage.setItem(STORE_KEYS.ATTEMPTS, JSON.stringify(localCache.attempts));
            localStorage.setItem('army_exam_db_size_bytes', localCache.dbSizeBytes.toString());
            return true;
        }
    } catch (e) {
        console.error("Failed to sync from backend, using localStorage fallback:", e);
    }
    
    // Fallback if offline
    localCache.questions = JSON.parse(localStorage.getItem(STORE_KEYS.QUESTIONS)) || [];
    localCache.users = JSON.parse(localStorage.getItem(STORE_KEYS.USERS)) || [];
    localCache.config = JSON.parse(localStorage.getItem(STORE_KEYS.CONFIG)) || DEFAULT_CONFIG;
    localCache.attempts = JSON.parse(localStorage.getItem(STORE_KEYS.ATTEMPTS)) || [];
    localCache.dbSizeBytes = parseInt(localStorage.getItem('army_exam_db_size_bytes') || '0');
    return false;
}

export function getDbSizeBytes() {
    return localCache.dbSizeBytes || parseInt(localStorage.getItem('army_exam_db_size_bytes') || '0');
}

// Initialize Store
export async function initStore() {
    // 1. Sync from server
    const synced = await syncFromBackend();
    
    // 2. Only seed defaults if:
    //    - We are online AND the server returned completely empty questions AND empty users (first time fresh server install)
    //    - OR we are offline AND localStorage is completely empty (first time offline user)
    const isFreshServer = synced && localCache.questions.length === 0 && localCache.users.length === 0;
    const isFreshOffline = !synced && (JSON.parse(localStorage.getItem(STORE_KEYS.QUESTIONS)) || []).length === 0;
    
    if (isFreshServer || isFreshOffline) {
        localCache.questions = DEFAULT_QUESTIONS;
        localCache.users = DEFAULT_USERS;
        localCache.config = DEFAULT_CONFIG;
        localCache.attempts = [];
        
        // Save to local
        localStorage.setItem(STORE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
        localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
        localStorage.setItem(STORE_KEYS.CONFIG, JSON.stringify(DEFAULT_CONFIG));
        localStorage.setItem(STORE_KEYS.ATTEMPTS, JSON.stringify([]));
        
        // Sync to server only if online (isFreshServer)
        if (synced) {
            saveQuestions(DEFAULT_QUESTIONS);
            saveUsers(DEFAULT_USERS);
            saveConfig(DEFAULT_CONFIG);
            saveAttempts([]);
        }
    }
}

// Questions Functions
export function getQuestions() {
    return localCache.questions.length > 0 ? localCache.questions : (JSON.parse(localStorage.getItem(STORE_KEYS.QUESTIONS)) || []);
}

export function saveQuestions(questions) {
    localCache.questions = questions;
    localStorage.setItem(STORE_KEYS.QUESTIONS, JSON.stringify(questions));
    fetch('/api/save_questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questions)
    }).catch(err => console.error("Error syncing questions to server:", err));
}

export function getSubjects() {
    const config = getConfig();
    const questions = getQuestions();
    const subjects = new Set();
    
    // 1. Add configured subjects in saved order
    if (Array.isArray(config.subjectOrder)) {
        config.subjectOrder.forEach(key => {
            if (key !== 'durationMinutes' && key !== 'subjectOrder') {
                subjects.add(key);
            }
        });
    }
    
    // 2. Add configured subjects in case they are not in subjectOrder
    Object.keys(config).forEach(key => {
        if (key !== 'durationMinutes' && key !== 'subjectOrder') {
            subjects.add(key);
        }
    });

    // 3. Add subjects from questions
    questions.forEach(q => {
        if (q.subject) subjects.add(q.subject);
    });
    
    return Array.from(subjects);
}

// User Functions
export function getUsers() {
    return localCache.users.length > 0 ? localCache.users : (JSON.parse(localStorage.getItem(STORE_KEYS.USERS)) || []);
}

export function saveUsers(users) {
    localCache.users = users;
    localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(users));
    fetch('/api/save_users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users)
    }).catch(err => console.error("Error syncing users to server:", err));
}

// Config Functions
export function getConfig() {
    return (localCache.config && Object.keys(localCache.config).length > 0) ? localCache.config : (JSON.parse(localStorage.getItem(STORE_KEYS.CONFIG)) || DEFAULT_CONFIG);
}

export function saveConfig(config) {
    localCache.config = config;
    localStorage.setItem(STORE_KEYS.CONFIG, JSON.stringify(config));
    fetch('/api/save_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    }).catch(err => console.error("Error syncing config to server:", err));
}

// Exam Attempts Functions
export function getAttempts() {
    return localCache.attempts.length > 0 ? localCache.attempts : (JSON.parse(localStorage.getItem(STORE_KEYS.ATTEMPTS)) || []);
}

export function saveAttempts(attempts) {
    localCache.attempts = attempts;
    localStorage.setItem(STORE_KEYS.ATTEMPTS, JSON.stringify(attempts));
    fetch('/api/save_attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempts)
    }).catch(err => console.error("Error syncing attempts to server:", err));
}

export function addAttempt(attempt) {
    const attempts = getAttempts();
    attempts.unshift(attempt); // newest first
    saveAttempts(attempts);
    
    // Send single attempt to server to prevent overwriting concurrency issues
    fetch('/api/add_attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt)
    }).catch(err => console.error("Error syncing attempt to server:", err));
}

// Reset Database to Seed values
export function resetDatabase() {
    localCache.questions = DEFAULT_QUESTIONS;
    localCache.users = DEFAULT_USERS;
    localCache.config = DEFAULT_CONFIG;
    localCache.attempts = [];
    
    localStorage.setItem(STORE_KEYS.QUESTIONS, JSON.stringify(DEFAULT_QUESTIONS));
    localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
    localStorage.setItem(STORE_KEYS.CONFIG, JSON.stringify(DEFAULT_CONFIG));
    localStorage.setItem(STORE_KEYS.ATTEMPTS, JSON.stringify([]));
    
    saveQuestions(DEFAULT_QUESTIONS);
    saveUsers(DEFAULT_USERS);
    saveConfig(DEFAULT_CONFIG);
    saveAttempts([]);
}
