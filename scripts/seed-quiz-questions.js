'use strict';

require('dotenv').config();
const { sequelize, Quiz, QuizQuestion, QuizQuestionOption } = require('../src/models');

async function seedQuizQuestions() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    // Ensure questions 3 and 4 exist for Quiz 2
    await sequelize.query(`
      INSERT INTO quiz_questions (id, quiz_id, prompt, question_type, points, order_number, created_at, updated_at)
      VALUES 
        (3, 2, 'What is the primary management step for severe postpartum hemorrhage?', 'single_choice', 50, 1, NOW(), NOW()),
        (4, 2, 'Which clinical sign indicates pre-eclampsia during antenatal care?', 'single_choice', 50, 2, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE 
        SET quiz_id = EXCLUDED.quiz_id, prompt = EXCLUDED.prompt, points = EXCLUDED.points;
    `);

    // Ensure options 5, 6 for Question 3, and 7, 8 for Question 4
    await sequelize.query(`
      INSERT INTO quiz_question_options (id, question_id, text, is_correct, order_number, created_at, updated_at)
      VALUES 
        (5, 3, 'Administer uterotonics and perform uterine massage', true, 1, NOW(), NOW()),
        (6, 3, 'Encourage oral hydration only', false, 2, NOW(), NOW()),
        (7, 4, 'Mild nausea in first trimester', false, 1, NOW(), NOW()),
        (8, 4, 'Hypertension with proteinuria or severe persistent headache', true, 2, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE 
        SET question_id = EXCLUDED.question_id, text = EXCLUDED.text, is_correct = EXCLUDED.is_correct;
    `);

    // Reset sequences
    await sequelize.query(`SELECT setval(pg_get_serial_sequence('quiz_questions', 'id'), COALESCE((SELECT MAX(id) FROM quiz_questions), 1));`);
    await sequelize.query(`SELECT setval(pg_get_serial_sequence('quiz_question_options', 'id'), COALESCE((SELECT MAX(id) FROM quiz_question_options), 1));`);

    console.log('Quiz 2 questions and options seeded successfully!');

    const quizWithQuestions = await Quiz.findByPk(2, {
      include: [{
        model: QuizQuestion,
        as: 'questions',
        include: [{ model: QuizQuestionOption, as: 'options' }],
      }],
    });

    console.log('Quiz 2 verification:');
    console.log(JSON.stringify({
      id: quizWithQuestions.id,
      title: quizWithQuestions.title,
      questions: quizWithQuestions.questions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        points: q.points,
        options: q.options.map(o => ({ id: o.id, text: o.text, is_correct: o.is_correct })),
      })),
    }, null, 2));

  } catch (error) {
    console.error('Error seeding quiz questions:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedQuizQuestions();
