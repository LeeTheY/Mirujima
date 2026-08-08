export function shouldRegisterServiceWorker(input: {
  secure: boolean;
  supported: boolean;
}): boolean {
  return input.secure && input.supported;
}
