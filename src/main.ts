import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const target = document.getElementById('app')

if (!target) {
  console.error('Could not find #app element!')
} else {
  mount(App, {
    target: target,
  })
}

export default null
