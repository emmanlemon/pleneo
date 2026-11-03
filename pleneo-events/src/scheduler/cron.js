import { CronExpressionParser } from 'cron-parser';
import { DomainErrors } from '#common/errors/domain-errors.js';

export function nextCronRun(expression, { timezone = 'UTC', from = new Date() } = {}) {
  try {
    return CronExpressionParser.parse(expression, { tz: timezone, currentDate: from }).next().toDate();
  } catch (err) {
    throw DomainErrors.invalidCron(err.message);
  }
}

export const isValidCron = (expression, timezone) => {
  try {
    nextCronRun(expression, { timezone });
    return true;
  } catch {
    return false;
  }
};
