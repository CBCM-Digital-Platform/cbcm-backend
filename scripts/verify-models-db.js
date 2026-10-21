require('dotenv').config();

const { QueryTypes } = require('sequelize');
const models = require('../src/models');
const expectedTableNames = [
  'users', 'user_preferences', 'user_credentials', 'refresh_tokens', 'password_reset_tokens',
  'facilities', 'mentorship_cycles', 'thematic_areas', 'cycle_facilities', 'cycle_thematic_areas',
  'assignments', 'knowledge_score_snapshots', 'assessments', 'assessment_criteria_scores',
  'assessment_checklist_items', 'assessment_evidence', 'learning_modules', 'learning_module_mentor_access',
  'learning_module_mentor_permissions', 'learning_module_contents', 'learning_content_progress', 'learning_module_progress',
  'quizzes', 'quiz_questions', 'quiz_question_options', 'quiz_attempts', 'quiz_attempt_answers', 'quiz_attempt_answer_options',
  'clinical_encounters', 'encounter_focus_areas', 'mentor_notes', 'logbook_entries', 'conversations',
  'conversation_participants', 'messages', 'message_reads', 'notifications', 'resources', 'resource_views',
  'starred_resources', 'news_posts', 'faqs', 'user_guides', 'ai_conversations', 'ai_messages',
  'ai_message_citations', 'certificate_templates', 'certificates', 'activity_logs', 'uploaded_files',
];

async function main() {
  const errors = [];
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Configure the existing Supabase connection in .env.');
    }

    await models.sequelize.authenticate();
    const columns = await models.sequelize.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN (:tableNames)
       ORDER BY table_name, ordinal_position`,
      { replacements: { tableNames: expectedTableNames }, type: QueryTypes.SELECT }
    );

    const actualColumnsByTable = new Map();
    for (const row of columns) {
      if (!actualColumnsByTable.has(row.table_name)) {
        actualColumnsByTable.set(row.table_name, new Set());
      }
      actualColumnsByTable.get(row.table_name).add(row.column_name);
    }

    for (const tableName of expectedTableNames) {
      const model = Object.values(models.sequelize.models).find(
        (registeredModel) => registeredModel.getTableName() === tableName
      );
      const actualColumns = actualColumnsByTable.get(tableName);
      if (!actualColumns) {
        errors.push(`Missing application table: ${tableName}`);
        continue;
      }
      if (!model) {
        errors.push(`No registered Sequelize model maps to table ${tableName}.`);
        continue;
      }

      const modelColumns = new Set(
        Object.values(model.getAttributes()).map((attribute) => attribute.field || attribute.fieldName)
      );
      const missingColumns = [...modelColumns].filter((columnName) => !actualColumns.has(columnName));
      const unexpectedColumns = [...actualColumns].filter((columnName) => !modelColumns.has(columnName));

      if (missingColumns.length || unexpectedColumns.length) {
        errors.push(
          `${tableName}: ${missingColumns.length ? `missing database columns [${missingColumns.join(', ')}]` : ''}` +
          `${missingColumns.length && unexpectedColumns.length ? '; ' : ''}` +
          `${unexpectedColumns.length ? `unexpected model columns [${unexpectedColumns.join(', ')}]` : ''}`
        );
      } else {
        console.log(`PASS: ${tableName} (${modelColumns.size} columns)`);
      }
    }

    if (errors.length) {
      errors.forEach((error) => console.error(`FAIL: ${error}`));
      process.exitCode = 1;
    } else {
      console.log(`PASS: all ${expectedTableNames.length} application tables match their model columns.`);
    }
  } catch (error) {
    console.error(`Database model verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await models.sequelize.close();
  }
}

main();
