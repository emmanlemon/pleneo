import { DomainErrors } from '#common/errors/domain-errors.js';
import * as outbox from '#infra/messaging/outbox.repository.js';
import { actorOf, loadAccessible, ownerScope } from '#modules/devices/access.js';
import { describeBreach } from '#modules/rules/rules.engine.js';
import * as alerts from './alert.repository.js';

const alertPayload = (alert, device) => ({
  alertId: alert.id,
  deviceId: device.id,
  deviceName: device.name,
  externalId: device.external_id,
  ownerId: device.owner_id,
  ownerEmail: device.owner_email,
  metric: alert.metric,
  value: alert.value,
  threshold: alert.threshold,
  severity: alert.severity,
  message: alert.message,
  raisedAt: alert.raised_at,
});

export async function raiseAlerts(device, breached, client) {
  const raised = [];
  for (const { rule, reading } of breached) {
    if (await alerts.recentForRule(rule.id, device.id, rule.cooldown_seconds, client)) continue;
    const alert = await alerts.insert(
      {
        ruleId: rule.id,
        deviceId: device.id,
        metric: reading.metric,
        value: reading.value,
        threshold: rule.threshold,
        operator: rule.operator,
        severity: rule.severity,
        message: `${rule.name}: ${describeBreach(rule, reading.value, reading.metric)}`,
      },
      client,
    );
    await outbox.add(
      {
        type: 'iot.alert.raised',
        payload: alertPayload(alert, device),
        idempotencyKey: `iot.alert.raised:${alert.id}`,
      },
      client,
    );
    raised.push(alert);
  }
  return raised;
}

export const listAlerts = async (auth, filters) => {
  const rows = await alerts.list({ ...filters, ownerId: ownerScope(auth) });
  return { alerts: rows, nextBefore: rows.length === filters.limit ? rows.at(-1).raised_at : null };
};

export const alertStats = (auth) => alerts.openCount(ownerScope(auth));

async function changeStatus(auth, id, status) {
  const current = await alerts.findById(id);
  if (!current) throw DomainErrors.notFound('Alert');
  const device = await loadAccessible(current.device_id, auth, { write: true });
  const updated = await alerts.transition(id, { status, actorId: actorOf(auth) });
  if (!updated) throw DomainErrors.invalidAlertTransition(current.status, status);
  if (status === 'resolved') {
    await outbox.add({
      type: 'iot.alert.resolved',
      payload: alertPayload(updated, device),
      idempotencyKey: `iot.alert.resolved:${updated.id}`,
    });
  }
  return updated;
}

export const acknowledgeAlert = (auth, id) => changeStatus(auth, id, 'acknowledged');
export const resolveAlert = (auth, id) => changeStatus(auth, id, 'resolved');
