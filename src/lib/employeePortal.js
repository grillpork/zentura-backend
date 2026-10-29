const employeePortal = (roleName) => {
  const role = roleName?.trim().toLowerCase();
  if (role === "guide" || role === "ไกด์") return "guide";
  if (role === "suppler" || role === "supplier") return "supplier";
  if (role && role !== "user") return "backoffice";
  return null;
};

module.exports = { employeePortal };
