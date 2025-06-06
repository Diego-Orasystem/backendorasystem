/**
 * Script para adaptar el formulario de Formspree a la API local
 * Incluir este script al final de la página donde está el formulario
 */
document.addEventListener('DOMContentLoaded', function() {
  // Selecciona el formulario que usa Formspree
  const formulario = document.querySelector('form[action="https://formspree.io/f/xanoyggn"]');
  
  if (formulario) {
    // Cambia la acción del formulario y evita que se envíe directamente
    formulario.setAttribute('action', '#');
    formulario.setAttribute('method', 'POST');
    
    formulario.addEventListener('submit', async function(event) {
      // Evita que el formulario se envíe de la manera tradicional
      event.preventDefault();
      
      // Obtén los campos del formulario
      const nameInput = formulario.querySelector('input[name="name"]');
      const emailInput = formulario.querySelector('input[name="email"]');
      const messageInput = formulario.querySelector('textarea[name="message"]');
      
      // Comprueba que todos los campos existen
      if (!nameInput || !emailInput || !messageInput) {
        alert('Error: No se pudieron encontrar todos los campos del formulario.');
        return;
      }
      
      // Crea el objeto con los datos del formulario
      const formData = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        message: messageInput.value.trim()
      };
      
      // Encuentra el botón de envío para cambiar su estado
      const submitButton = formulario.querySelector('button[type="submit"]');
      const originalButtonText = submitButton ? submitButton.innerHTML : '';
      
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = 'Enviando...';
      }
      
      try {
        // Envía los datos a tu API (ajusta la URL según donde esté alojada tu API)
        const response = await fetch('http://localhost:3000/api/formulario', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
          // Si todo va bien, muestra un mensaje de éxito
          alert('¡Mensaje enviado correctamente!');
          formulario.reset();
        } else {
          // Si hay un error en la API, muestra el mensaje de error
          alert(`Error: ${data.message || 'No se pudo enviar el mensaje.'}`);
        }
      } catch (error) {
        // Si hay un error de conexión, muestra un mensaje genérico
        console.error('Error al enviar el formulario:', error);
        alert('Error de conexión. Por favor, inténtelo más tarde.');
      } finally {
        // Restaura el botón a su estado original
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = originalButtonText;
        }
      }
    });
    
    console.log('Formulario adaptado correctamente para usar la API local.');
  } else {
    console.error('No se encontró el formulario de Formspree en esta página.');
  }
}); 