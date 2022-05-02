import axios from 'axios'

export const get = async () => {
  const resp = await axios.get('http://localhost:4000/queue')
  return {
    body: { ...resp.data }
  }
}
