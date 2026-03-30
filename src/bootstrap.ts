import { createApp } from "./application/create-app";
import { InMemoryPersonalDoctorStore } from "./infrastructure/InMemoryPersonalDoctorStore";

export function bootstrap() {
  const store = new InMemoryPersonalDoctorStore();
  const app = createApp({ store });

  return {
    app,
    store,
  };
}
