'use client';

import { AdminGuard } from '@/components/admin/admin-guard';
import { EventsTable } from '@/components/admin/events-table';
import { JobsTable } from '@/components/admin/jobs-table';
import { QueueOverview } from '@/components/admin/queue-overview';
import { SchedulesTable } from '@/components/admin/schedules-table';
import { SubscriptionsTable } from '@/components/admin/subscriptions-table';
import { TestEmailCard } from '@/components/admin/test-email-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueueStats } from '@/lib/events/hooks';

function QueueConsole() {
  const stats = useQueueStats();
  const queues = Object.keys(stats.data?.queues ?? {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Queues</h1>
        <p className="text-muted-foreground text-sm">
          Jobs, dead letters, schedules, webhook subscriptions and the event stream of pleneo-events.
        </p>
      </div>
      <QueueOverview />
      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="dead">Dead letter</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="pt-2">
          <JobsTable queues={queues} />
        </TabsContent>
        <TabsContent value="dead" className="pt-2">
          <JobsTable fixedStatus="dead" queues={queues} />
        </TabsContent>
        <TabsContent value="schedules" className="pt-2">
          <SchedulesTable />
        </TabsContent>
        <TabsContent value="subscriptions" className="pt-2">
          <SubscriptionsTable />
        </TabsContent>
        <TabsContent value="events" className="pt-2">
          <EventsTable />
        </TabsContent>
        <TabsContent value="email" className="pt-2">
          <TestEmailCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function QueuesPage() {
  return (
    <AdminGuard>
      <QueueConsole />
    </AdminGuard>
  );
}
