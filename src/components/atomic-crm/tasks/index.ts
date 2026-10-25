import React from "react";

const TaskList = React.lazy(() => import("./TaskList"));

export default {
  list: TaskList,
};
