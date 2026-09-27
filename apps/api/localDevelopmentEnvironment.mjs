const seededDemoOwner = '00000000-0000-4000-8000-000000000101';

export function configureLocalDevelopmentEnvironment(environment = process.env) {
  if (environment.NODE_ENV === undefined) environment.NODE_ENV = 'development';
  if (environment.NODE_ENV === 'production') {
    environment.EASYLEDGER_LOCAL_DEMO_ENABLED = 'false';
    return environment;
  }
  if (environment.NODE_ENV !== 'development') return environment;

  if (environment.EASYLEDGER_LOCAL_DEMO_DISABLED === 'true') {
    environment.EASYLEDGER_LOCAL_DEMO_ENABLED = 'false';
    return environment;
  }

  environment.EASYLEDGER_LOCAL_DEMO_ENABLED = 'true';
  if (!environment.EASYLEDGER_LOCAL_DEMO_USER_ID?.trim()) {
    environment.EASYLEDGER_LOCAL_DEMO_USER_ID = seededDemoOwner;
  }
  return environment;
}
