import React from "react";

import { Box, Text } from "@chakra-ui/react";

const Footer: React.FC = (props) => (
  <Box as="footer" mt={42} {...props}>
    <Text>&copy; andrejusk {new Date().getFullYear()}</Text>
  </Box>
);

export default Footer;
