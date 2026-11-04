require('dotenv').config();

const expectedModels = [
  ['User', 'users'],
  ['UserPreference', 'user_preferences'],
  ['UserCredential', 'user_credentials'],
  ['RefreshToken', 'refresh_tokens'],
  ['PasswordResetToken', 'password_reset_tokens'],
  ['Facility', 'facilities'],
  ['MentorshipCycle', 'mentorship_cycles'],
  ['ThematicArea', 'thematic_areas'],
  ['CycleFacility', 'cycle_facilities'],
  ['CycleThematicArea', 'cycle_thematic_areas'],
  ['Assignment', 'assignments'],
  ['KnowledgeScoreSnapshot', 'knowledge_score_snapshots'],
  ['Assessment', 'assessments'],
  ['AssessmentCriteriaScore', 'assessment_criteria_scores'],
  ['AssessmentChecklistItem', 'assessment_checklist_items'],
  ['LearningModule', 'learning_modules'],
  ['LearningModuleMentorAccess', 'learning_module_mentor_access'],
  ['LearningModuleMentorPermission', 'learning_module_mentor_permissions'],
  ['LearningModuleContent', 'learning_module_contents'],
  ['LearningContentProgress', 'learning_content_progress'],
  ['LearningModuleProgress', 'learning_module_progress'],
  ['Quiz', 'quizzes'],
  ['QuizQuestion', 'quiz_questions'],
  ['QuizQuestionOption', 'quiz_question_options'],
  ['QuizAttempt', 'quiz_attempts'],
  ['QuizAttemptAnswer', 'quiz_attempt_answers'],
  ['QuizAttemptAnswerOption', 'quiz_attempt_answer_options'],
  ['ClinicalEncounter', 'clinical_encounters'],
  ['EncounterFocusArea', 'encounter_focus_areas'],
  ['MentorNote', 'mentor_notes'],
  ['LogbookEntry', 'logbook_entries'],
  ['Conversation', 'conversations'],
  ['ConversationParticipant', 'conversation_participants'],
  ['Message', 'messages'],
  ['MessageRead', 'message_reads'],
  ['Notification', 'notifications'],
  ['Resource', 'resources'],
  ['ResourceView', 'resource_views'],
  ['StarredResource', 'starred_resources'],
  ['NewsPost', 'news_posts'],
  ['FAQ', 'faqs'],
  ['UserGuide', 'user_guides'],
  ['AIConversation', 'ai_conversations'],
  ['AIMessage', 'ai_messages'],
  ['AIMessageCitation', 'ai_message_citations'],
  ['CertificateTemplate', 'certificate_templates'],
  ['Certificate', 'certificates'],
  ['ActivityLog', 'activity_logs'],
  ['UploadedFile', 'uploaded_files'],
  ['AssessmentEvidence', 'assessment_evidence'],
  ['ResourceAssignment', 'resource_assignments'],
];

function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to initialize the configured Sequelize instance.');
  }

  const models = require('../src/models');
  const errors = [];
  const registered = models.sequelize.models;
  let associationCount = 0;

  if (Object.keys(registered).length !== expectedModels.length) {
    errors.push(`Expected ${expectedModels.length} registered models; found ${Object.keys(registered).length}.`);
  }

  for (const [name, tableName] of expectedModels) {
    const model = registered[name];
    if (!model) {
      errors.push(`Model ${name} is not registered.`);
      continue;
    }

    if (model.getTableName() !== tableName) {
      errors.push(`${name} maps to ${model.getTableName()} instead of ${tableName}.`);
    }

    if (Object.keys(model.getAttributes()).length === 0) {
      errors.push(`${name} has no defined attributes.`);
    }

    associationCount += Object.keys(model.associations).length;
    console.log(`${name} -> ${tableName}`);
  }

  if (associationCount === 0) {
    errors.push('No Sequelize associations are registered.');
  }

  if (errors.length) {
    errors.forEach((error) => console.error(`FAIL: ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${expectedModels.length} models and ${associationCount} associations registered.`);
}

try {
  main();
} catch (error) {
  console.error(`Model loading failed: ${error.message}`);
  process.exitCode = 1;
}
