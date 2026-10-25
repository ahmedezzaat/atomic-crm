import React from "react";

const CustomerList = React.lazy(() => import("./CustomerList"));
const CustomerShow = React.lazy(() => import("./CustomerShow"));

export default {
  list: CustomerList,
  show: CustomerShow,
};
