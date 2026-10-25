import { useState } from "react";
import { useListContext, useTranslate } from "ra-core";
import { List } from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type { Task as TData } from "../types";
import { Task } from "./Task";

type Status = "open" | "done" | "all";

export const TaskList = () => (
  <List
    title={false}
    perPage={200}
    sort={{ field: "due_date", order: "ASC" }}
    actions={false}
    pagination={false}
  >
    <TaskListContent />
  </List>
);

const TaskListContent = () => {
  const translate = useTranslate();
  const { data, isPending } = useListContext<TData>();
  const [status, setStatus] = useState<Status>("open");

  if (isPending) return null;

  const tasks = (data ?? []).filter((task) =>
    status === "all"
      ? true
      : status === "done"
        ? !!task.done_date
        : !task.done_date,
  );

  return (
    <div className="flex flex-col gap-4 mt-2">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {translate("resources.tasks.name", { smart_count: 2 })}
        </h1>
        <div className="flex gap-2">
          {(["open", "done", "all"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? "default" : "outline"}
              onClick={() => setStatus(value)}
            >
              {translate(`resources.tasks.status.${value}`)}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("resources.tasks.list_empty")}
            </p>
          ) : (
            tasks.map((task) => <Task key={task.id} task={task} showContact />)
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskList;
