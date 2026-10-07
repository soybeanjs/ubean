<script lang="ts">
definePage({
  ssr: 'data-only'
});

export async function loader() {
  return { source: 'loader' };
}

export default {};
</script>

<template>
  <div>
    <h1>Dashboard</h1>
    <p>
      Select SSR
      <code>data-only</code>
      : loader runs, HTML is a CSR shell.
    </p>
  </div>
</template>
