const id = '6652ec2376f5e40207e35e87'; // your intern ID

fetch(`http://localhost:3000/api/interns/${id}`, {
  method: 'DELETE',
})
  .then(res => {
    if (!res.ok) throw new Error(`Failed with status ${res.status}`);
    return res.text();
  })
  .then(data => console.log('Deleted:', data))
  .catch(err => console.error('Error:', err));
