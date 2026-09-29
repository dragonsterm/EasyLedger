/** Local development no longer supplies a demo identity implicitly. */
export function configureLocalDevelopmentEnvironment(environment = process.env) {
  if (environment.NODE_ENV === undefined) environment.NODE_ENV = 'development';
  environment.EASYLEDGER_LOCAL_DEMO_ENABLED = 'false';
  delete environment.EASYLEDGER_LOCAL_DEMO_USER_ID;
  return environment;
}
