const exitTimeout = 10000;

afterAll(() => {
  setTimeout(() => {
    throw new Error(`Process did not exit after ${exitTimeout}ms.`);
  }, exitTimeout).unref();
});
