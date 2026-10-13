window.DIALOGUES = [
  {
    "id": "self-intro",
    "title": "初次见面，介绍自己",
    "scene": "学校迎新活动",
    "level": "A2",
    "icon": "👋",
    "minutes": 4,
    "goal": "能说出名字、来自哪里、自己的爱好，并礼貌回应对方。",
    "tips": "英语自我介绍先给名字，再说城市或国家，最后加一个爱好，最容易自然展开。",
    "warmup": ["My name is ...", "I am from ...", "I like ...", "Nice to meet you."],
    "turns": [
      {"ai": "Hi! I'm Emma. What's your name?", "aiZh": "嗨！我是艾玛。你叫什么名字？", "hint": "My name is ... / I am ...", "sample": "Hi Emma, my name is Li Ming.", "accept": ["my name is", "i'm", "i am", "this is"]}
     , {"ai": "Nice to meet you, Li Ming. Where are you from?", "aiZh": "很高兴认识你，李明。你来自哪里？", "hint": "I am from ... / I come from ...", "sample": "I'm from Chengdu, a city in southwest China.", "accept": ["i'm from", "i am from", "i come from", "from"]}
     , {"ai": "Sounds interesting. What do you like to do in your free time?", "aiZh": "听起来很有意思。你空闲时间喜欢做什么？", "hint": "I like ... / I enjoy ... / My hobby is ...", "sample": "I like playing basketball and watching movies.", "accept": ["i like", "i love", "i enjoy", "my hobby", "i usually"]}
     , {"ai": "That is cool. Do you have any hobbies that use English?", "aiZh": "真不错。你有用到英语的爱好吗？", "hint": "Yes, I ... / I listen to ... / I read ...", "sample": "Yes, I listen to English songs and read short news.", "accept": ["yes", "i listen", "i read", "i watch", "english"]}
     , {"ai": "Great. It was really nice talking with you.", "aiZh": "太好了，和你聊天很愉快。", "hint": "Nice talking to you too. / See you.", "sample": "Nice talking to you too. See you later.", "accept": ["nice talking", "nice to meet", "see you", "thank you", "too"]}
    ]
  },
];
window.DIALOGUES.push({
  id: 'coffee',
  title: '在咖啡店点单',
  scene: '街角咖啡店',
  level: 'A2',
  icon: '☕',
  minutes: 5,
  goal: '会用礼貌句式点饮料，回答尺寸、堂食或外带、付款等问题。',
  tips: '点单时用 I would like 或 Can I have 比 I want 更礼貌。',
  warmup: ['I would like ...', 'Can I have ...?', 'For here or to go?', 'That is all, thanks.'],
  turns: [
    { ai: 'Hi, welcome. What can I get for you today?', aiZh: '你好，欢迎。今天想喝点什么？', hint: 'I would like a ... / Can I have a ...?', sample: 'I would like a latte, please.', accept: ['i would like', 'i d like', 'can i have', 'can i get'] },
    { ai: 'Sure. What size would you like, small, medium or large?', aiZh: '好的。您要什么杯型，小杯、中杯还是大杯？', hint: 'A medium, please.', sample: 'A medium, please.', accept: ['small', 'medium', 'large'] }
    , { ai: 'Would you like it hot or iced?', aiZh: '您要热的还是冰的？', hint: 'Hot, please. / Iced, please.', sample: 'Iced, please.', accept: ['hot', 'iced', 'ice'] }
    , { ai: 'For here or to go?', aiZh: '在这儿喝还是带走？', hint: 'For here. / To go, please.', sample: 'To go, please.', accept: ['for here', 'to go', 'take away', 'takeout'] }
    , { ai: 'Anything else? We have fresh cookies today.', aiZh: '还需要别的吗？我们今天有新鲜饼干。', hint: 'No, thanks. / Yes, I would like ...', sample: 'No, that is all. Thanks.', accept: ['no', 'that is all', 'yes', 'cookie', 'i would like'] }
    , { ai: 'Okay, that is five dollars. How would you like to pay?', aiZh: '好的，一共五美元。您想怎么付款？', hint: 'By card. / In cash. / Apple Pay.', sample: 'By card, please.', accept: ['card', 'cash', 'apple pay', 'phone', 'credit'] }
    , { ai: 'Perfect. Your drink will be ready in a minute. Have a nice day.', aiZh: '好的。您的饮料一分钟就好。祝您今天愉快。', hint: 'Thank you. You too.', sample: 'Thank you. You too.', accept: ['thank', 'you too', 'have a nice', 'thanks'] }
  ]
});
window.DIALOGUES.push({
  id: 'directions',
  title: '在街上问路',
  scene: '地铁站出口',
  level: 'A2',
  icon: '🧭',
  minutes: 5,
  goal: '能礼貌地问路、听懂方向指令，并确认距离和地标。',
  tips: '问路先以 Excuse me 开头。听到方向后，可以重复关键信息确认。',
  warmup: ['Excuse me, how can I get to ...?', 'Is it far?', 'Go straight, turn left, turn right.', 'Thank you for your help.'],
  turns: [
    { ai: 'Hello, you look a little lost. Can I help you?', aiZh: '你好，你看起来有点迷路。需要帮忙吗？', hint: 'Excuse me, how can I get to ...?', sample: 'Excuse me, how can I get to the city library?', accept: ['excuse me', 'how can i get', 'where is', 'can you tell me', 'help'] },
    { ai: 'The city library? Sure. Walk straight for two blocks, then turn left at the bank.', aiZh: '城市图书馆？当然。直走两个街区，然后在银行处左转。', hint: 'Repeat: straight, then turn left at ...', sample: 'Straight for two blocks, then left at the bank?', accept: ['straight', 'left', 'bank', 'two blocks', 'okay'] },
    { ai: 'That is right. After you turn left, you will see a small park. The library is across from it.', aiZh: '没错。左转后你会看到一个小公园。图书馆就在公园对面。', hint: 'Is it across from the park?', sample: 'So it is across from the park, right?', accept: ['across', 'park', 'right', 'yes', 'okay'] },
    { ai: 'Yes. It is about a ten-minute walk. Do you want to take the bus instead?', aiZh: '是的。走路大约十分钟。你想改坐公交车吗？', hint: 'No, walking is fine. / Yes, which bus?', sample: 'No, I will walk. Thank you.', accept: ['walk', 'no', 'bus', 'yes', 'fine', 'thank'] },
    { ai: 'You are welcome. Enjoy your visit.', aiZh: '不客气。祝你参观愉快。', hint: 'Thank you for your help.', sample: 'Thank you for your help. Have a good day.', accept: ['thank', 'good day', 'you too', 'help'] }
  ]
});
window.DIALOGUES.push({
  id: 'small-talk',
  title: '同事间的闲聊',
  scene: '周一办公室茶水间',
  level: 'B1',
  icon: '🗣️',
  minutes: 5,
  goal: '能自然地开启话题、回应对方、分享周末并礼貌结束对话。',
  tips: '闲聊不需要复杂句子。先回应对方，再加一句自己的情况，对话就能继续。',
  warmup: ['How was your weekend?', 'Not bad. How about you?', 'I went to ...', 'Anyway, I should get back to work.'],
  turns: [
    { ai: 'Morning. How was your weekend?', aiZh: '早上好。周末过得怎么样？', hint: 'It was great / relaxing / busy. How about yours?', sample: 'It was relaxing, thanks. How about yours?', accept: ['good', 'great', 'relaxing', 'busy', 'okay', 'not bad', 'how about'] },
    { ai: 'Pretty good. I finally watched that new science show. Did you do anything special?', aiZh: '挺好的。我终于看了那档新科学节目。你做了什么特别的事吗？', hint: 'I went to ... / I watched ... / I just stayed home.', sample: 'I went hiking with a friend on Sunday.', accept: ['i went', 'i watched', 'i stayed', 'i played', 'nothing special', 'friend'] },
    { ai: 'That sounds fun. Was the weather nice?', aiZh: '听起来很有趣。天气好吗？', hint: 'Yes, it was sunny / warm / cool.', sample: 'Yes, it was sunny but not too hot.', accept: ['yes', 'sunny', 'warm', 'cool', 'nice', 'cold', 'rain'] },
    { ai: 'Lucky you. I heard it may rain later this week.', aiZh: '你运气真好。听说这周晚些时候可能下雨。', hint: 'I hope not. / I should bring an umbrella.', sample: 'I hope not. I should bring an umbrella.', accept: ['hope', 'umbrella', 'rain', 'really', 'maybe'] },
    { ai: 'Anyway, I should get back to work. Good talking to you.', aiZh: '总之，我该回去工作了。和你聊天很开心。', hint: 'You too. See you at lunch.', sample: 'You too. See you at lunch.', accept: ['you too', 'see you', 'have a good', 'likewise', 'talk later'] }
  ]
});
window.DIALOGUES.push({
  id: 'hotel',
  title: '酒店入住与需求',
  scene: '酒店前台',
  level: 'B1',
  icon: '🏨',
  minutes: 5,
  goal: '会办理入住、确认订单、提出延迟退房或换房等简单需求。',
  tips: '礼貌请求常用 Could I ... 或 Would it be possible to ...，听起来比 I want 更专业。',
  warmup: ['I have a reservation under ...', 'Could I have a wake-up call?', 'Is breakfast included?', 'Could I check out later?'],
  turns: [
    { ai: 'Good evening. Welcome to the Riverside Hotel. Do you have a reservation?', aiZh: '晚上好。欢迎来到河畔酒店。请问您有预订吗？', hint: 'Yes, I have a reservation under ...', sample: 'Yes, I have a reservation under Wang.', accept: ['yes', 'reservation', 'booked', 'under', 'name'] },
    { ai: 'Let me check. Wang, yes, a double room for three nights. Is that correct?', aiZh: '我查一下。王，是的，双人房三晚，对吗？', hint: 'Yes, that is correct.', sample: 'Yes, that is correct.', accept: ['yes', 'correct', 'right', 'that'] },
    { ai: 'Great. Could I see your passport, please?', aiZh: '好的。可以出示一下您的护照吗？', hint: 'Sure, here you are.', sample: 'Sure, here you are.', accept: ['sure', 'here you are', 'here', 'of course', 'yes'] },
    { ai: 'Thank you. Breakfast is from seven to ten on the second floor. Is there anything else you need?', aiZh: '谢谢。早餐在二楼，早上七点到十点。还需要别的吗？', hint: 'Could I have a wake-up call at ...? / Is there Wi-Fi?', sample: 'Could I have a wake-up call at seven, please?', accept: ['could i', 'wake-up', 'wifi', 'wi-fi', 'breakfast', 'no', 'thanks'] },
    { ai: 'Of course. Anything else?', aiZh: '当然。还有别的事吗？', hint: 'Could I check out later tomorrow?', sample: 'Could I check out an hour later tomorrow?', accept: ['check out', 'later', 'no', 'that is all', 'thanks'] },
    { ai: 'No problem. Your room is 508. The elevator is on your right. Enjoy your stay.', aiZh: '没问题。您的房间是 508。电梯在您右边。祝您入住愉快。', hint: 'Thank you very much.', sample: 'Thank you very much.', accept: ['thank', 'thanks', 'great', 'you too'] }
  ]
});
window.DIALOGUES.push({
  id: 'interview',
  title: '简单的工作面试',
  scene: '视频面试',
  level: 'B1',
  icon: '💼',
  minutes: 6,
  goal: '用完整句子介绍经历、优势、学习意愿，并礼貌提问。',
  tips: '面试回答用 观点加例子 的结构。比如：I am good at teamwork. In my last job, I ...',
  warmup: ['I have ... years of experience.', 'My strength is ...', 'I am good at ...', 'Could you tell me more about ...?'],
  turns: [
    { ai: 'Thanks for joining us today. Could you tell me a little about yourself?', aiZh: '感谢你今天参加面试。能简单介绍一下自己吗？', hint: 'I am a ... with ... experience.', sample: 'I am a marketing assistant with two years of experience.', accept: ['i am', 'i have', 'my name', 'work as', 'experience'] },
    { ai: 'What made you interested in this position?', aiZh: '是什么让你对这个职位感兴趣？', hint: 'I am interested in ... because ...', sample: 'I am interested in this role because I want to grow my skills.', accept: ['interested', 'because', 'i want', 'i like', 'company', 'role'] },
    { ai: 'What would you say is your greatest strength?', aiZh: '你觉得自己最大的优势是什么？', hint: 'My strength is ... / I am good at ...', sample: 'My strength is communication. I am good at working with different teams.', accept: ['strength', 'good at', 'i can', 'my advantage', 'team', 'communicat'] },
    { ai: 'Can you give me an example?', aiZh: '能给我举个例子吗？', hint: 'In my last job, I ...', sample: 'In my last job, I helped two teams finish a project on time.', accept: ['in my', 'last', 'example', 'once', 'project', 'i helped', 'i worked'] },
    { ai: 'Great. Do you have any questions for us?', aiZh: '很好。你有什么问题想问我们吗？', hint: 'Could you tell me more about ...?', sample: 'Could you tell me more about the team?', accept: ['could you', 'can you', 'tell me', 'what', 'how', 'team', 'training'] },
    { ai: 'Of course. We will send you more details by email. Thanks for your time.', aiZh: '当然。我们会通过邮件发送更多细节。感谢你的时间。', hint: 'Thank you for your time.', sample: 'Thank you for your time. I look forward to hearing from you.', accept: ['thank', 'look forward', 'you too', 'goodbye'] }
  ]
});
