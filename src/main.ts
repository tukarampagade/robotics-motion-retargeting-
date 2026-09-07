type Joke = {
  setup: string;
  punchline: string;
};

const setupElement = document.getElementById('setup');
const punchlineElement = document.getElementById('punchline');
const errorElement = document.getElementById('error');
const loadingElement = document.getElementById('loading');
const newJokeButton = document.getElementById('new-joke-btn');

if (
  !setupElement ||
  !punchlineElement ||
  !errorElement ||
  !loadingElement ||
  !newJokeButton
) {
  throw new Error('Required UI elements are missing from index.html');
}

const setLoading = (isLoading: boolean): void => {
  newJokeButton.toggleAttribute('disabled', isLoading);
  loadingElement.hidden = !isLoading;
};

const showJoke = (joke: Joke): void => {
  setupElement.textContent = joke.setup;
  punchlineElement.textContent = joke.punchline;
  errorElement.textContent = '';
};

const showError = (): void => {
  errorElement.textContent =
    'Sorry, we could not load a joke right now. Please try again.';
};

const fetchJoke = async (): Promise<void> => {
  setLoading(true);

  try {
    const response = await fetch(
      'https://official-joke-api.appspot.com/random_joke',
    );

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data: unknown = await response.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      !('setup' in data) ||
      !('punchline' in data) ||
      typeof data.setup !== 'string' ||
      typeof data.punchline !== 'string'
    ) {
      throw new Error('Invalid joke response');
    }

    showJoke({setup: data.setup, punchline: data.punchline});
  } catch {
    showError();
  } finally {
    setLoading(false);
  }
};

newJokeButton.addEventListener('click', fetchJoke);

void fetchJoke();
